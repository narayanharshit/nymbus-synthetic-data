/**
 * Synthetic identifiers and contact details.
 *
 * Deliberate choices so the data is clearly fake yet correctly shaped:
 *  - SSNs use area number 666, which the SSA has never issued -> guaranteed
 *    invalid, but still a valid SSN *shape* for parsers/validators under test.
 *  - EINs use prefix 00, which the IRS never assigns -> same idea.
 *  - Routing numbers pass the ABA checksum (so format validators accept them)
 *    but do not correspond to any real financial institution.
 *  - Emails use example.com (RFC 2606 reserved) and phones use the 555-01xx
 *    range reserved for fiction.
 * These assumptions are surfaced in the app and the README.
 */

import { Rng } from "./rng";

export function formatId(prefix: string, n: number, width: number): string {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

/** SSN-shaped, guaranteed-invalid (area 666 is never issued). */
export function syntheticSSN(rng: Rng): string {
  const group = String(rng.int(1, 99)).padStart(2, "0");
  const serial = String(rng.int(1, 9999)).padStart(4, "0");
  return `666-${group}-${serial}`;
}

/** EIN-shaped, guaranteed-invalid (prefix 00 is never assigned). */
export function syntheticEIN(rng: Rng): string {
  const rest = String(rng.int(0, 9_999_999)).padStart(7, "0");
  return `00-${rest}`;
}

/** 10-digit synthetic account number. */
export function accountNumber(rng: Rng): string {
  let n = "";
  for (let i = 0; i < 10; i++) n += rng.int(0, 9);
  return n;
}

/** Mask all but the last four digits for display. */
export function maskAccount(num: string): string {
  return `••••${num.slice(-4)}`;
}

/**
 * 9-digit routing number that satisfies the ABA checksum
 * 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) ≡ 0 (mod 10), yet maps to no real bank.
 */
export function syntheticRoutingNumber(rng: Rng): string {
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const d: number[] = [];
  for (let i = 0; i < 8; i++) d.push(rng.int(0, 9));
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += d[i] * weights[i];
  const d9 = (10 - (sum % 10)) % 10;
  d.push(d9);
  return d.join("");
}

const EMAIL_DOMAINS = ["example.com", "example.org", "mail.example.com"];
const AREA_CODES = ["319", "406", "828", "541", "706", "785", "802", "928"];

export function syntheticEmail(rng: Rng, local: string): string {
  const slug = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${slug}${rng.int(1, 99)}@${rng.pick(EMAIL_DOMAINS)}`;
}

/** Phone in the 555-01xx range reserved for fictional use. */
export function syntheticPhone(rng: Rng): string {
  const area = rng.pick(AREA_CODES);
  const line = String(rng.int(0, 99)).padStart(2, "0");
  return `(${area}) 555-01${line}`;
}
