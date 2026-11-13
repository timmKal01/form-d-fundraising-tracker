// SEC EDGAR: the full-text search index for Form D filings (efts.sec.gov), and each filing's primary_doc.xml from the
// public archive (www.sec.gov/Archives). The SEC's fair-access policy allows at most 10 requests a second and asks
// tools to say who they are; every request carries this actor's name and Store link, and requests are spaced so a
// run stays near 4 a second.
const UA = 'form-d-fundraising-tracker/0.1 (+https://apify.com/m_ctim/form-d-fundraising-tracker)';
const SEARCH_URL = 'https://efts.sec.gov/LATEST/search-index';
const PAGE_SIZE = 100; // what the search index returns per page

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const TIMEOUT_MS = 20_000;
const GAP_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nextSlot = 0;
/** Spaces every SEC request at least GAP_MS apart, across the whole run. */
async function waitTurn() {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + GAP_MS;
    if (at > now) await sleep(at - now);
}

/** Retries transient failures (rate limits, upstream 5xx, timeouts) instead of failing the whole run on one hiccup. */
async function secFetch(url, accept) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await waitTurn();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: controller.signal });
            if (res.ok) return await res.text(); // read inside the timeout too
            await res.body?.cancel().catch(() => {});
            lastError = new Error(`SEC EDGAR answered HTTP ${res.status}`);
            if (!TRANSIENT_STATUSES.has(res.status)) throw lastError;
        } catch (err) {
            if (err === lastError) throw err;
            lastError = err.name === 'AbortError' ? new Error(`SEC EDGAR didn't answer within ${TIMEOUT_MS / 1000} s`) : err;
        } finally {
            clearTimeout(timer);
        }
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    throw lastError;
}

function cleanCompanyName(displayName) {
    return (displayName ?? '').replace(/\s*\(CIK\s*\d+\)\s*$/i, '').trim();
}

/** One search-index hit -> the basic filing fields (everything a row had before 2026-11-13). */
export function hitToFiling(src) {
    const cik = src.ciks?.[0] ?? null;
    const cikNum = cik ? String(Number(cik)) : null;
    const accessionNoDashes = src.adsh ? src.adsh.replace(/-/g, '') : null;
    const folder = cikNum && accessionNoDashes ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionNoDashes}` : null;
    return {
        companyName: cleanCompanyName(src.display_names?.[0]),
        cik,
        formType: src.form ?? null,
        filingDate: src.file_date ?? null,
        state: src.biz_states?.[0] ?? null,
        location: src.biz_locations?.[0] ?? null,
        incorporatedIn: src.inc_states?.[0] ?? null,
        accessionNumber: src.adsh ?? null,
        filingUrl: folder ? `${folder}/${src.adsh}-index.htm` : null,
        formXmlUrl: folder ? `${folder}/primary_doc.xml` : null,
    };
}

/**
 * Form D filings in the date range, newest first, a page of 100 at a time.
 * @returns {AsyncGenerator<object>} basic filings (see hitToFiling)
 */
export async function* searchFilings({ keyword, states, startDate, maxPages = 20 }) {
    for (let page = 0; page < maxPages; page++) {
        const url = new URL(SEARCH_URL);
        if (keyword) url.searchParams.set('q', keyword);
        url.searchParams.set('forms', 'D');
        url.searchParams.set('dateRange', 'custom');
        url.searchParams.set('startdt', startDate.toISOString().slice(0, 10));
        url.searchParams.set('enddt', new Date().toISOString().slice(0, 10));
        if (states?.length) url.searchParams.set('locationCodes', states.map((s) => s.toUpperCase()).join(','));
        if (page > 0) url.searchParams.set('from', String(page * PAGE_SIZE));
        const data = JSON.parse(await secFetch(url.href, 'application/json'));
        const hits = data.hits?.hits ?? [];
        for (const h of hits) yield hitToFiling(h._source);
        const total = data.hits?.total?.value ?? 0;
        if (hits.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= total) return;
    }
}

/** The filing's own Form D document. */
export const fetchFormXml = (filing) => secFetch(filing.formXmlUrl, 'application/xml,text/xml');
