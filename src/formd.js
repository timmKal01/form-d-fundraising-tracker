// One Form D filing (primary_doc.xml from SEC EDGAR) -> the fields a buyer acts on: how much was raised, from how many
// investors, under which exemption, by what kind of company, and who runs it. Added 2026-11-13; before that a row
// held only what EDGAR's search index returns (name, date, location, link).
//
// People ("related persons": executive officers, directors, promoters) come back as name, role, city and state. Their
// street addresses are left out on purpose: the form often lists a person's home address.
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    isArray: (name) => ['relatedPersonInfo', 'relationship', 'item', 'recipient'].includes(name),
});

// Federal exemptions and exclusions claimed (Form D item 6), as written on the form.
const EXEMPTIONS = {
    '04': 'Rule 504(b)(1)', '04.1': 'Rule 504(b)(1)(i)', '04.2': 'Rule 504(b)(1)(ii)', '04.3': 'Rule 504(b)(1)(iii)',
    '06b': 'Rule 506(b)', '06c': 'Rule 506(c)', '4a5': 'Securities Act Section 4(a)(5)',
    '3C': 'Investment Company Act Section 3(c)',
};
const exemptionName = (code) => EXEMPTIONS[code] ?? (/^3C\.(\d+)$/.test(code) ? `Investment Company Act Section 3(c)(${code.split('.')[1]})` : code);

const SECURITY_TYPES = {
    isEquityType: 'Equity', isDebtType: 'Debt', isOptionToAcquireType: 'Option, warrant or other right to acquire', isSecurityToBeAcquiredType: 'Security to be acquired on exercise of an option or warrant',
    isPooledInvestmentFundType: 'Pooled investment fund interests', isTenantInCommonType: 'Tenant-in-common securities', isMineralPropertyType: 'Mineral property securities',
    isBusinessCombinationTransaction: null,
};

const str = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(typeof v === 'object' ? (v.value ?? '') : v).trim();
    return s === '' || /^none$/i.test(s) ? null : s;
};
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true';
/** "3200000" -> 3200000; "Indefinite" and blanks -> null. */
const money = (v) => {
    const s = str(v);
    if (!s || !/^-?\d+(\.\d+)?$/.test(s.replace(/,/g, ''))) return null;
    return Number(s.replace(/,/g, ''));
};

export const isFund = (row) => row?.industry === 'Pooled Investment Fund';

/** Parses one Form D XML document. Returns null when it isn't one. */
export function parseFormD(xml) {
    const doc = parser.parse(String(xml ?? ''))?.edgarSubmission;
    if (!doc) return null;
    const issuer = doc.primaryIssuer ?? {};
    const addr = issuer.issuerAddress ?? {};
    const offering = doc.offeringData ?? {};
    const industry = offering.industryGroup ?? {};
    const filing = offering.typeOfFiling ?? {};
    const amounts = offering.offeringSalesAmounts ?? {};
    const investors = offering.investors ?? {};
    const fees = offering.salesCommissionsFindersFees ?? {};
    const yearOfInc = issuer.yearOfInc ?? {};
    const securities = offering.typesOfSecuritiesOffered ?? {};
    const firstSale = filing.dateOfFirstSale ?? {};

    const relatedPersons = (doc.relatedPersonsList?.relatedPersonInfo ?? []).map((p) => {
        const n = p.relatedPersonName ?? {};
        return {
            // Companies listed as related persons often put "N/A" in the first-name box.
            name: [n.firstName, n.middleName, n.lastName].map(str).filter((x) => x && !/^n\/?a$/i.test(x)).join(' ') || null,
            relationships: (p.relatedPersonRelationshipList?.relationship ?? []).map(str).filter(Boolean),
            clarification: str(p.relationshipClarification),
            city: str(p.relatedPersonAddress?.city),
            state: str(p.relatedPersonAddress?.stateOrCountry),
        };
    });

    const totalOfferingRaw = str(amounts.totalOfferingAmount);
    return {
        companyName: str(issuer.entityName),
        cik: str(issuer.cik),
        industry: str(industry.industryGroupType),
        fundType: str(industry.investmentFundInfo?.investmentFundType),
        entityType: str(issuer.entityType) === 'Other' ? str(issuer.entityTypeOtherDesc) ?? 'Other' : str(issuer.entityType),
        yearOfIncorporation: str(yearOfInc.value) ? Number(str(yearOfInc.value)) : null,
        incorporatedWithinFiveYears: yearOfInc.withinFiveYears !== undefined ? yes(yearOfInc.withinFiveYears) : yearOfInc.overFiveYears !== undefined ? false : null,
        jurisdictionOfIncorporation: str(issuer.jurisdictionOfInc),
        revenueRange: str(offering.issuerSize?.revenueRange) ?? str(offering.issuerSize?.aggregateNetAssetValueRange),
        address: { street: [str(addr.street1), str(addr.street2)].filter(Boolean).join(', ') || null, city: str(addr.city), state: str(addr.stateOrCountry), zip: str(addr.zipCode) },
        phone: str(issuer.issuerPhoneNumber),
        isAmendment: yes(filing.newOrAmendment?.isAmendment),
        previousAccessionNumber: str(filing.newOrAmendment?.previousAccessionNumber),
        dateOfFirstSale: str(firstSale.value),
        firstSaleYetToOccur: yes(firstSale.yetToOccur),
        offeringLongerThanOneYear: yes(offering.durationOfOffering?.moreThanOneYear),
        securitiesOffered: [
            ...Object.entries(SECURITY_TYPES).filter(([k, label]) => label && yes(securities[k])).map(([, label]) => label),
            ...(yes(securities.isOtherType) ? [str(securities.descriptionOfOtherType) ?? 'Other'] : []),
        ],
        exemptions: (offering.federalExemptionsExclusions?.item ?? []).map(str).filter(Boolean).map(exemptionName),
        offering: {
            totalOfferingAmount: money(totalOfferingRaw),
            totalOfferingIndefinite: /^indefinite$/i.test(totalOfferingRaw ?? ''),
            totalAmountSold: money(amounts.totalAmountSold),
            totalRemaining: money(amounts.totalRemaining),
            minimumInvestment: money(offering.minimumInvestmentAccepted),
            currency: 'USD',
        },
        investors: {
            total: money(investors.totalNumberAlreadyInvested),
            hasNonAccredited: yes(investors.hasNonAccreditedInvestors),
            nonAccredited: money(investors.numberNonAccreditedInvestors),
        },
        salesCommissions: money(fees.salesCommissions?.dollarAmount),
        findersFees: money(fees.findersFees?.dollarAmount),
        placementAgents: (offering.salesCompensationList?.recipient ?? []).map((r) => str(r.recipientName) ?? str(r.associatedBDName)).filter(Boolean),
        relatedPersons,
        // The signature block sits inside offeringData on the form.
        signedBy: str((offering.signatureBlock ?? doc.signatureBlock)?.signature?.nameOfSigner),
        signedTitle: str((offering.signatureBlock ?? doc.signatureBlock)?.signature?.signatureTitle),
        signedDate: str((offering.signatureBlock ?? doc.signatureBlock)?.signature?.signatureDate),
    };
}
