/**
 * Date helpers for coherent posting vs. effective dates.
 *
 * Effective (value) date is when a transaction is economically dated; posting
 * date is when it hits the ledger. Normally posting == effective or the next
 * business day. Edge cases (backdated/holiday postings) deliberately widen that
 * gap, and the validator checks the relationship stays coherent.
 */

import { Rng } from "./rng";

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromISO(s: string): Date {
  // Parse as UTC midnight to avoid timezone drift.
  return new Date(`${s}T00:00:00Z`);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** ISO date `months` calendar-months after `startISO`. */
export function isoMonthsLater(startISO: string, months: number): string {
  const d = fromISO(startISO);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toISO(d);
}

export function daysBetween(aISO: string, bISO: string): number {
  return Math.round(
    (fromISO(bISO).getTime() - fromISO(aISO).getTime()) / 86_400_000,
  );
}

export function randomDateISO(rng: Rng, startISO: string, endISO: string): string {
  const span = Math.max(0, daysBetween(startISO, endISO));
  return toISO(addDays(fromISO(startISO), rng.int(0, span)));
}

export function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** Minimal fixed-date US bank-holiday set (month-day), good enough for posting logic. */
const FIXED_HOLIDAYS = new Set([
  "01-01", // New Year's Day
  "06-19", // Juneteenth
  "07-04", // Independence Day
  "11-11", // Veterans Day
  "12-25", // Christmas Day
]);

export function isHoliday(d: Date): boolean {
  const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
  return FIXED_HOLIDAYS.has(mmdd);
}

export function isBusinessDay(d: Date): boolean {
  return !isWeekend(d) && !isHoliday(d);
}

/** First business day on or after d. */
export function nextBusinessDay(d: Date): Date {
  let r = new Date(d);
  let guard = 0;
  while (!isBusinessDay(r) && guard++ < 10) r = addDays(r, 1);
  return r;
}
