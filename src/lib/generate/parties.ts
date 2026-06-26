/**
 * Party generation: individuals and businesses with synthetic identities.
 */

import type { Party, PartyType } from "../domain/types";
import type { GenerationSpec } from "../domain/spec";
import { Rng } from "./rng";
import {
  BUSINESS_NAME_PARTS,
  CITIES,
  FIRST_NAMES,
  LAST_NAMES,
  STREET_NAMES,
  STREET_SUFFIXES,
} from "./pools";
import {
  formatId,
  syntheticEIN,
  syntheticEmail,
  syntheticPhone,
  syntheticSSN,
} from "./identity";

function makeAddress(rng: Rng) {
  const c = rng.pick(CITIES);
  const number = rng.int(100, 9899);
  const street = `${number} ${rng.pick(STREET_NAMES)} ${rng.pick(STREET_SUFFIXES)}`;
  return { line1: street, city: c.city, state: c.state, zip: c.zip };
}

/** ISO date `daysBack` days before `ref`. */
function daysBeforeISO(ref: Date, daysBack: number): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export function generateParties(rng: Rng, spec: GenerationSpec): Party[] {
  const parties: Party[] = [];
  const end = new Date(spec.dateRange.end);
  const endYear = end.getFullYear();

  for (let i = 0; i < spec.partyCount; i++) {
    const id = formatId("PTY", i + 1, 6);
    const type: PartyType = rng.bool(spec.businessRatio) ? "business" : "individual";

    // Relationship tenure: between ~1 month and 6 years before the window end.
    const memberSince = daysBeforeISO(end, rng.int(30, 6 * 365));

    if (type === "business") {
      const name = `${rng.pick(BUSINESS_NAME_PARTS.prefixes)} ${rng.pick(
        BUSINESS_NAME_PARTS.industries,
      )} ${rng.pick(BUSINESS_NAME_PARTS.suffixes)}`;
      parties.push({
        id,
        type,
        businessName: name,
        taxId: syntheticEIN(rng),
        taxIdType: "ein",
        email: syntheticEmail(rng, name.replace(/[^A-Za-z0-9]+/g, "")),
        phone: syntheticPhone(rng),
        address: makeAddress(rng),
        memberSince,
      });
    } else {
      const firstName = rng.pick(FIRST_NAMES);
      const lastName = rng.pick(LAST_NAMES);
      const age = rng.int(18, 88);
      const dobYear = endYear - age;
      const dobMonth = String(rng.int(1, 12)).padStart(2, "0");
      const dobDay = String(rng.int(1, 28)).padStart(2, "0");
      parties.push({
        id,
        type,
        firstName,
        lastName,
        dateOfBirth: `${dobYear}-${dobMonth}-${dobDay}`,
        taxId: syntheticSSN(rng),
        taxIdType: "ssn",
        email: syntheticEmail(rng, `${firstName}.${lastName}`),
        phone: syntheticPhone(rng),
        address: makeAddress(rng),
        memberSince,
      });
    }
  }

  return parties;
}

export function partyDisplayName(p: Party): string {
  return p.type === "business"
    ? p.businessName ?? "(business)"
    : `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
}
