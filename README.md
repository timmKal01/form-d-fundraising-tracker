# Startup Fundraising Tracker — New SEC Form D Filings

Track new SEC Form D filings — the mandatory disclosure private companies
file within 15 days of raising money under a Reg D exemption, which
covers the large majority of startup fundraises. Search by keyword or
state, get the company name, filing date, location, and a link to the
filing.

Built for VCs, journalists, and sales teams who want to know who just
raised money — often before it shows up in any funding-news roundup.

## Input

```json
{
  "keyword": "",
  "states": ["CA", "NY"],
  "daysBack": 7,
  "maxResults": 50
}
```

| Field | Type | Description |
|---|---|---|
| `keyword` | string (optional) | Free-text search across filings (e.g. a company name or industry term). Leave blank to return all new Form D filings. |
| `states` | array of strings (optional) | Two-letter state codes to filter by business location. Leave empty for nationwide. |
| `daysBack` | number | How many days back from today to include, by filing date. Default `7`, max `90`. |
| `maxResults` | number | Max filings to return, most recently filed first. Default `50`, max `100`. |

## Output

One record per filing:

```json
{
  "companyName": "GTCR Fund XV/B LP",
  "cik": "0002141706",
  "filingDate": "2026-08-06",
  "state": "IL",
  "location": "Chicago, IL",
  "incorporatedIn": "DE",
  "accessionNumber": "0002141706-26-000001",
  "filingUrl": "https://www.sec.gov/Archives/edgar/data/2141706/000214170626000001/0002141706-26-000001-index.htm"
}
```

A search with no matches in the requested window returns no items but is
still billed once for the search.

## How it works

Direct calls to the official [SEC EDGAR full text search
API](https://www.sec.gov/edgar/search/) (`efts.sec.gov`), filtered to Form
D filings. No proxy, no key, no scraping.

**Note:** Form D discloses that a raise happened and basic company/filer
info — it doesn't always disclose the exact dollar amount raised (that
field is optional on the form itself). Use the `filingUrl` to pull the
full filing for deal-size detail when it's disclosed.

## Pricing note

Billed per **search**, not per filing returned — one charge whether the
search returns 1 filing or 100.

## Related products

- [Company Buying Signal Report](https://github.com/timmKal01/company-buying-signal-report) — once you know who raised money, check their hiring activity for a fuller buying signal
- [SEC 8-K Material Event Tracker](https://github.com/timmKal01/sec-8k-material-event-tracker) — the public-company equivalent: material events from public filings
