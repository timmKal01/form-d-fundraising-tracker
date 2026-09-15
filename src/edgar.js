const UA = 'FormDFundraisingTracker/0.1 (contact: formd-tracker-admin@example.com)';
const API_URL = 'https://efts.sec.gov/LATEST/search-index';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries transient failures (rate limits, upstream 5xx) instead of failing the whole run on one hiccup. */
async function secFetch(url, options) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res;
        try {
            res = await fetch(url, options);
        } catch (err) {
            lastError = err;
            if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
            continue;
        }
        if (res.ok) return res;
        if (!TRANSIENT_STATUSES.has(res.status)) {
            throw new Error(`SEC EDGAR full text search failed: ${res.status}`);
        }
        lastError = new Error(`SEC EDGAR full text search failed: ${res.status}`);
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    throw lastError;
}

function cleanCompanyName(displayName) {
    return (displayName ?? '').replace(/\s*\(CIK\s*\d+\)\s*$/i, '').trim();
}

export async function fetchFilings({ keyword, states, startDate, maxResults }) {
    const url = new URL(API_URL);
    if (keyword) url.searchParams.set('q', keyword);
    url.searchParams.set('forms', 'D');
    url.searchParams.set('dateRange', 'custom');
    url.searchParams.set('startdt', startDate.toISOString().slice(0, 10));
    url.searchParams.set('enddt', new Date().toISOString().slice(0, 10));
    if (states?.length) url.searchParams.set('locationCodes', states.map((s) => s.toUpperCase()).join(','));

    const res = await secFetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const data = await res.json();
    const hits = data.hits?.hits ?? [];

    return hits.slice(0, maxResults).map((h) => {
        const src = h._source;
        const cik = src.ciks?.[0] ?? null;
        const cikNum = cik ? String(Number(cik)) : null;
        const accessionNoDashes = src.adsh ? src.adsh.replace(/-/g, '') : null;

        return {
            companyName: cleanCompanyName(src.display_names?.[0]),
            cik,
            filingDate: src.file_date ?? null,
            state: src.biz_states?.[0] ?? null,
            location: src.biz_locations?.[0] ?? null,
            incorporatedIn: src.inc_states?.[0] ?? null,
            accessionNumber: src.adsh ?? null,
            filingUrl: cikNum && accessionNoDashes ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionNoDashes}/${src.adsh}-index.htm` : null,
        };
    });
}
