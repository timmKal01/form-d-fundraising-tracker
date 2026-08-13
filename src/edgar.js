const UA = 'FormDFundraisingTracker/0.1 (contact: formd-tracker-admin@example.com)';
const API_URL = 'https://efts.sec.gov/LATEST/search-index';

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

    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`SEC EDGAR full text search failed: ${res.status}`);

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
