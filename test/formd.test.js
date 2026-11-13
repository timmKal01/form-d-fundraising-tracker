// Form D parsing against three real filings from 2026-11-12: an operating company, a pooled fund, and an amendment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isFund, parseFormD } from '../src/formd.js';
import { hitToFiling } from '../src/edgar.js';

const load = (name) => parseFormD(readFileSync(new URL(`./fixtures/formd-${name}.xml`, import.meta.url), 'utf8'));

test('an operating company: the raise, the company, decoded exemption', () => {
    const r = load('company');
    assert.equal(r.companyName, '58EOS, LLC');
    assert.equal(r.industry, 'Restaurants');
    assert.equal(isFund(r), false);
    assert.equal(r.yearOfIncorporation, 2025);
    assert.equal(r.incorporatedWithinFiveYears, true);
    assert.deepEqual(r.offering, { totalOfferingAmount: 3200000, totalOfferingIndefinite: false, totalAmountSold: 400000, totalRemaining: 2800000, minimumInvestment: 200000, currency: 'USD' });
    assert.equal(r.investors.total, 2);
    assert.deepEqual(r.exemptions, ['Rule 506(b)']);
    assert.equal(r.dateOfFirstSale, '2026-10-28');
    assert.deepEqual(r.securitiesOffered, ['Equity']);
    assert.equal(r.signedTitle, 'Attorney');
});

test('people: name, role, city and state, never a street address', () => {
    const r = load('company');
    assert.equal(r.relatedPersons.length, 4);
    assert.deepEqual(r.relatedPersons[0], { name: 'Chris Hyndman', relationships: ['Executive Officer'], clarification: null, city: 'Chicago', state: 'IL' });
    assert.ok(r.relatedPersons.every((p) => !('street' in p) && !('zip' in p)));
    assert.ok(!JSON.stringify(r.relatedPersons).includes('Michigan Ave'), 'the home address on the form is not copied');
    // A company listed as a related person: the "N/A" first-name placeholder is dropped.
    assert.equal(load('fund').relatedPersons[0].name, 'Roc360 Feeder Manager LLC');
});

test('a pooled fund: recognised, indefinite offering amount, Investment Company Act exclusions decoded', () => {
    const r = load('fund');
    assert.equal(isFund(r), true);
    assert.equal(r.offering.totalOfferingAmount, null);
    assert.equal(r.offering.totalOfferingIndefinite, true);
    assert.equal(r.offering.totalAmountSold, 302000000);
    assert.deepEqual(r.exemptions, ['Rule 506(b)', 'Investment Company Act Section 3(c)', 'Investment Company Act Section 3(c)(7)']);
});

test('an amendment points at the filing it amends; sales commissions and placement agents', () => {
    const r = load('amendment');
    assert.equal(r.isAmendment, true);
    assert.equal(r.previousAccessionNumber, '0002164105-26-000001');
    assert.equal(r.salesCommissions, 197283);
    assert.deepEqual(r.placementAgents, ['Clarity Capital Limited']);
    assert.equal(parseFormD('<html>not a form</html>'), null);
});

test('search hit -> filing links', () => {
    const f = hitToFiling({ ciks: ['0002164858'], display_names: ['58EOS, LLC  (CIK 0002164858)'], form: 'D', file_date: '2026-11-12', adsh: '0002164858-26-000001', biz_states: ['IL'], biz_locations: ['Chicago, IL'], inc_states: ['IL'] });
    assert.equal(f.companyName, '58EOS, LLC');
    assert.equal(f.formXmlUrl, 'https://www.sec.gov/Archives/edgar/data/2164858/000216485826000001/primary_doc.xml');
    assert.equal(f.filingUrl, 'https://www.sec.gov/Archives/edgar/data/2164858/000216485826000001/0002164858-26-000001-index.htm');
});
