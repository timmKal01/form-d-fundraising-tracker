# Startup Funding Tracker: Recently Funded Companies (Form D)

For sales teams, investors, recruiters and journalists: companies that just raised money, straight from the SEC Form D filings they must file within 15 days of the first sale. Each row has how much was raised, from how many investors, the industry, the company's phone and address, and the people running it. Investment funds are filtered out, so you get operating companies, not hedge funds and SPVs.

## What you get

- **The raise:** amount sold so far, total offering size, minimum investment, number of investors, date of first sale, and what was sold (equity, debt, SAFEs, options)
- **The company:** industry, entity type, year of incorporation, revenue range, business address and phone number
- **The people:** executive officers, directors and promoters by name, role, city and state
- **The fine print:** exemption claimed (Rule 506(b), 506(c), 504...), sales commissions, finder's fees and placement agents
- **Companies, not funds:** pooled investment funds are about half of all Form D filings (56 of 110 in one week's sample); they're left out unless you ask for them. Amendments are left out too, so each row is a new raise.
- **Only new filings:** schedule it with `onlyNew` and each run returns only filings earlier runs didn't

## Example output

A real row from a local test run on 2026-11-13 (`industries: ["Technology"]`, `minAmountSold: 1000000`). The people's names are hidden here; the actor returns them:

```json
{
  "rowType": "filing",
  "companyName": "Arcophos, Inc.",
  "cik": "0002164566",
  "formType": "D",
  "filingDate": "2026-11-10",
  "industry": "Other Technology",
  "entityType": "Corporation",
  "yearOfIncorporation": 2026,
  "incorporatedWithinFiveYears": true,
  "revenueRange": "Decline to Disclose",
  "offering": {
    "totalOfferingAmount": 10000000,
    "totalOfferingIndefinite": false,
    "totalAmountSold": 3510000,
    "totalRemaining": 6490000,
    "minimumInvestment": 0,
    "currency": "USD"
  },
  "investors": { "total": 3, "hasNonAccredited": false, "nonAccredited": null },
  "dateOfFirstSale": "2026-11-01",
  "exemptions": ["Rule 506(b)"],
  "securitiesOffered": ["Simple Agreement for Future Equity (SAFE)"],
  "salesCommissions": 0,
  "findersFees": 0,
  "placementAgents": [],
  "relatedPersons": [
    { "name": "(hidden here)", "relationships": ["Executive Officer", "Director"], "clarification": "Chief Executive Officer and Secretary; sole director", "city": "San Francisco", "state": "CA" },
    { "name": "(hidden here)", "relationships": ["Executive Officer"], "clarification": "President", "city": "San Francisco", "state": "CA" },
    { "name": "(hidden here)", "relationships": ["Executive Officer"], "clarification": "Chief Technology Officer", "city": "San Francisco", "state": "CA" }
  ],
  "phone": "4154098691",
  "address": { "street": "250 MONTGOMERY STREET, SUITE 450", "city": "SAN FRANCISCO", "state": "CA", "zip": "94104" },
  "state": "CA",
  "location": "San Francisco, CA",
  "incorporatedIn": "DE",
  "isAmendment": false,
  "accessionNumber": "0002164566-26-000002",
  "filingUrl": "https://www.sec.gov/Archives/edgar/data/2164566/000216456626000002/0002164566-26-000002-index.htm"
}
```

`rowType` is `"filing"`. A run that finds nothing returns one free `"note"` row saying why (for example, how many funds and amendments were skipped). If a filing's Form D document can't be read, the row still comes back with the basic fields and a `detailError`.

## Use cases

- **Sales and business development:** a company that just raised is about to hire and buy. Reach out while the budget is fresh, with the company's own phone and address.
- **Recruiters:** newly funded startups in your city and industry, with the founders' names.
- **Investors and analysts:** who is raising, how much, how fast, and under which exemption, by state and industry.
- **Journalists and newsletters:** raises that haven't been announced yet, on a daily schedule with `onlyNew`.

## Input

| Field | What it does |
|---|---|
| `keyword` | Full-text search across the filings: a company name, or a word like `software` or `clinic`. |
| `states` | Two-letter state codes of the company's business address, e.g. `CA`, `NY`. |
| `industries` | Keep filings whose industry contains any of these: `Technology`, `Health Care`, `Biotechnology`, `Real Estate`, `Restaurants`, `Banking`... |
| `minAmountSold` | Keep filings that report at least this many dollars sold so far. |
| `includeFunds` | Also return pooled investment funds. Off by default. |
| `includeAmendments` | Also return Form D/A amendments. Off by default. |
| `daysBack` | Days back from today, by filing date. Default 7, up to 90. |
| `maxResults` | Maximum filings, newest first. Default 50, up to 500. |
| `onlyNew` | Skip filings earlier runs with the same `seenListName` returned. For scheduled runs. |
| `seenListName` | The list `onlyNew` remembers filings in. Give each schedule or client its own. |

Newly funded tech and health companies that raised $1 million or more in the last two weeks:

```json
{
  "industries": ["Technology", "Health Care", "Biotechnology"],
  "minAmountSold": 1000000,
  "daysBack": 14
}
```

A daily feed of new raises in California and New York (schedule it):

```json
{
  "states": ["CA", "NY"],
  "daysBack": 3,
  "onlyNew": true,
  "seenListName": "ca-ny-raises"
}
```

## What it costs

$0.003 per filing returned. Note and error rows are free, and so are the funds, amendments and other filings skipped by your filters.

| Run | Filings | Cost |
|---|---|---|
| The default: the 50 newest company raises of the last 7 days | 50 | $0.15 |
| 10 tech and health companies that raised $1M+ in two weeks | 10 | $0.03 |
| 500 filings | 500 | $1.50 |

Set `maxResults` to cap what a run can cost.

## How it works

1. The official [SEC EDGAR full-text search](https://www.sec.gov/edgar/search/) lists new Form D filings, newest first.
2. Each filing's Form D document is read from the public EDGAR archive and turned into one row.
3. Funds, amendments and anything outside your filters are skipped before they become rows.

No API key, no login and no proxy. Requests identify this actor and stay at about 4 a second, well inside the SEC's limit of 10.

## Notes

- **Amounts are what the company reported.** `totalAmountSold` is the amount sold as of the filing; `totalOfferingIndefinite` is true when the company didn't state a total.
- **People's street addresses are left out.** The form often lists an executive's home address; rows give their city and state only.
- **One company can file more than one Form D on the same day**, one per offering, so a company can appear on more than one row.
- **Some companies raise without filing, or file late.** Form D is required for Regulation D raises, not for every round.

## Related products

- [SAM.gov Open Bids & Federal Contract Awards](https://apify.com/m_ctim/federal-contract-award-tracker): companies winning federal contracts, and open bids to win
- [SEC 8-K Tracker](https://apify.com/m_ctim/sec-8k-material-event-tracker): the public-company side: material events from 8-K filings
