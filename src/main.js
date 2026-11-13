import { Actor, log } from 'apify';
import { fetchFormXml, searchFilings } from './edgar.js';
import { isFund, parseFormD } from './formd.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    keyword,
    states = [],
    daysBack = 7,
    maxResults = 50,
    includeFunds = false,
    includeAmendments = false,
    industries = [],
    minAmountSold,
    onlyNew = false,
    seenListName = 'form-d-seen',
} = input;

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify (per filing since 2026-11-13). */
const FILING_EVENT = 'filing';
const SEEN_KEY = 'seen-accession-numbers';
const MAX_SEEN = 50_000;

const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
const limit = Math.max(1, Math.min(maxResults, 500));
const wantIndustries = (industries ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
// Leave 30 s before the run's time limit to save what was found.
const timeoutAt = Actor.getEnv().timeoutAt;
const deadline = timeoutAt ? new Date(timeoutAt).getTime() - 30_000 : Infinity;

// onlyNew: each schedule or client keeps its own list of filings already returned, in a named store that outlives runs.
const storeName = String(seenListName || 'form-d-seen').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'form-d-seen';
const seenStore = onlyNew ? await Actor.openKeyValueStore(storeName) : null;
const seen = new Set(seenStore ? (await seenStore.getValue(SEEN_KEY)) ?? [] : []);

const skipped = { amendment: 0, fund: 0, industry: 0, amount: 0, alreadyReturned: 0, detailsUnreadable: 0 };
const returned = [];
let scanned = 0;
let stoppedEarly = false;
let searchError = null;

try {
    for await (const filing of searchFilings({ keyword, states, startDate })) {
        if (returned.length >= limit) break;
        if (Date.now() > deadline) { stoppedEarly = true; break; }
        scanned++;
        // A D/A amends an earlier filing; it isn't a new raise.
        if (!includeAmendments && filing.formType === 'D/A') { skipped.amendment++; continue; }
        if (onlyNew && seen.has(filing.accessionNumber)) { skipped.alreadyReturned++; continue; }

        let details = null;
        let detailError = null;
        try {
            details = parseFormD(await fetchFormXml(filing));
            if (!details) detailError = "The filing's Form D document couldn't be read.";
        } catch (err) {
            detailError = `The filing's Form D document couldn't be read (${err.message}).`;
        }
        if (details) {
            // Pooled investment funds (hedge, private equity, real estate funds and SPVs) are about half of all Form D
            // filings, and noise for anyone looking for companies that raised money.
            if (!includeFunds && isFund(details)) { skipped.fund++; continue; }
            if (wantIndustries.length && !wantIndustries.some((w) => (details.industry ?? '').toLowerCase().includes(w))) { skipped.industry++; continue; }
            if (minAmountSold && !(details.offering.totalAmountSold >= minAmountSold)) { skipped.amount++; continue; }
        } else if (wantIndustries.length || minAmountSold) {
            skipped.detailsUnreadable++; // can't be shown to match the filters
            continue;
        }

        const row = {
            rowType: 'filing',
            companyName: details?.companyName ?? filing.companyName,
            cik: filing.cik,
            formType: filing.formType,
            filingDate: filing.filingDate,
            industry: details?.industry ?? null,
            fundType: details?.fundType ?? null,
            entityType: details?.entityType ?? null,
            yearOfIncorporation: details?.yearOfIncorporation ?? null,
            incorporatedWithinFiveYears: details?.incorporatedWithinFiveYears ?? null,
            revenueRange: details?.revenueRange ?? null,
            offering: details?.offering ?? null,
            investors: details?.investors ?? null,
            dateOfFirstSale: details?.dateOfFirstSale ?? null,
            firstSaleYetToOccur: details?.firstSaleYetToOccur ?? null,
            exemptions: details?.exemptions ?? [],
            securitiesOffered: details?.securitiesOffered ?? [],
            salesCommissions: details?.salesCommissions ?? null,
            findersFees: details?.findersFees ?? null,
            placementAgents: details?.placementAgents ?? [],
            relatedPersons: details?.relatedPersons ?? [],
            phone: details?.phone ?? null,
            address: details?.address ?? null,
            state: filing.state,
            location: filing.location,
            incorporatedIn: filing.incorporatedIn,
            jurisdictionOfIncorporation: details?.jurisdictionOfIncorporation ?? null,
            isAmendment: details?.isAmendment ?? filing.formType === 'D/A',
            previousAccessionNumber: details?.previousAccessionNumber ?? null,
            offeringLongerThanOneYear: details?.offeringLongerThanOneYear ?? null,
            signedBy: details?.signedBy ?? null,
            signedTitle: details?.signedTitle ?? null,
            signedDate: details?.signedDate ?? null,
            accessionNumber: filing.accessionNumber,
            filingUrl: filing.filingUrl,
            formXmlUrl: filing.formXmlUrl,
            detailError,
        };
        await Actor.pushData(row);
        await Actor.charge({ eventName: FILING_EVENT });
        returned.push(filing.accessionNumber);
    }
} catch (err) {
    searchError = err.message;
    log.warning(`SEC EDGAR search failed: ${err.message}`);
}

if (seenStore && returned.length) {
    for (const a of returned) seen.add(a);
    await seenStore.setValue(SEEN_KEY, [...seen].slice(-MAX_SEEN));
}

const skippedText = Object.entries(skipped).filter(([, n]) => n).map(([k, n]) => `${n} ${{ amendment: 'amendments', fund: 'investment funds', industry: 'other industries', amount: 'under the minimum amount', alreadyReturned: 'already returned', detailsUnreadable: 'unreadable' }[k]}`).join(', ');
log.info(`Returned ${returned.length} filing(s) from ${scanned} checked${skippedText ? `; skipped ${skippedText}` : ''}${stoppedEarly ? '; stopped near the time limit' : ''}.`);

if (searchError && returned.length === 0) {
    await Actor.pushData({ rowType: 'error', error: `SEC EDGAR's search couldn't be read (${searchError}). Not charged.` });
    await Actor.fail(`SEC EDGAR's search couldn't be read: ${searchError}. Nothing was charged.`);
} else {
    if (returned.length === 0) {
        // An empty dataset looks the same as a broken run, so say why nothing came back.
        await Actor.pushData({ rowType: 'note', note: `No Form D filings matched in the last ${daysBack} days (${scanned} checked${skippedText ? `; skipped ${skippedText}` : ''}). Loosen the filters, raise daysBack, or set includeFunds to see investment funds too.` });
    } else if (stoppedEarly) {
        await Actor.pushData({ rowType: 'note', note: `Stopped near the run's time limit after ${returned.length} filings. Give the run more time to get more.` });
    }
    await Actor.exit();
}
