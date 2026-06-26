/**
 * Money is represented EVERYWHERE as an integer number of minor units (cents).
 *
 * This is a deliberate correctness decision: floating-point dollars
 * (e.g. 0.1 + 0.2 !== 0.3) silently break reconciliation. By keeping every
 * amount as an integer cent value, "ending balance === opening + sum(txns)"
 * holds exactly, and the validation panel can prove it with `===`.
 */

/** Convert a dollar amount to integer minor units (cents). */
export function toMinor(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Convert integer minor units (cents) back to a dollar number. */
export function fromMinor(minor: number): number {
  return minor / 100;
}

/** Format integer minor units as a USD string, e.g. -1234567 -> "-$12,345.67". */
export function formatUSD(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = dollars.toLocaleString("en-US");
  return `${negative ? "-" : ""}$${grouped}.${cents.toString().padStart(2, "0")}`;
}

/** Round a cent amount to the nearest whole dollar (in cents). */
export function roundToDollarMinor(minor: number): number {
  return Math.round(minor / 100) * 100;
}
