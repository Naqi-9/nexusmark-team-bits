import { PLATFORMS, FORMATS_BY_PLATFORM, type Platform, type ContentFormat } from './contentTypes.ts';

/** All dates are calendar dates 'YYYY-MM-DD' (no time zone drift). */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateString(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtc(s: string): Date {
  const m = DATE_RE.exec(s)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Today's date in a given IANA time zone (falls back to the browser's). */
export function todayInTimeZone(timeZone?: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    return isValidDateString(parts) ? parts : fmt(now);
  } catch {
    return fmt(now);
  }
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(date: string): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function weekDays(date: string): string[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Weeks (arrays of 7 dates, Monday first) covering the month containing `date`. */
export function monthGrid(date: string): { weeks: string[][]; month: number } {
  const d = toUtc(date);
  const first = fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const last = fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  const weeks: string[][] = [];
  let cursor = startOfWeek(first);
  while (cursor <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return { weeks, month: d.getUTCMonth() };
}

export function shiftMonth(date: string, delta: number): string {
  const d = toUtc(date);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)));
}

export interface PlanSlot {
  index: number;
  date: string;
  platform: Platform;
  format: ContentFormat;
  pillar: string;
}

export interface ScheduleParams {
  startDate: string;
  days: 7 | 30;
  platforms: Platform[];
  /** Posts per week across the whole plan (1-14). */
  postsPerWeek: number;
  pillars: string[];
}

export const MAX_PLAN_SLOTS = 30;

/**
 * Deterministic schedule: real dates, evenly spread over the window, platforms and
 * pillars rotated. The AI fills in content for each slot; it never chooses the dates.
 */
export function buildSchedule(p: ScheduleParams): PlanSlot[] {
  if (!isValidDateString(p.startDate)) throw new Error('Invalid start date.');
  const platforms = p.platforms.filter(x => (PLATFORMS as readonly string[]).includes(x));
  if (platforms.length === 0) throw new Error('Select at least one platform.');
  const pillars = p.pillars.map(x => x.trim()).filter(Boolean);
  const pillarList = pillars.length ? pillars : ['General'];
  const perWeek = Math.min(14, Math.max(1, Math.round(p.postsPerWeek)));
  const total = Math.min(MAX_PLAN_SLOTS, Math.max(1, Math.round((perWeek * p.days) / 7)));

  const slots: PlanSlot[] = [];
  for (let i = 0; i < total; i++) {
    const dayOffset = Math.min(p.days - 1, Math.floor((i * p.days) / total));
    const platform = platforms[i % platforms.length];
    const formats = FORMATS_BY_PLATFORM[platform].filter(f => f !== 'campaign');
    // rotate formats per platform so one platform does not get the same format every time
    const nth = Math.floor(i / platforms.length);
    slots.push({
      index: i,
      date: addDays(p.startDate, dayOffset),
      platform,
      format: formats[nth % formats.length],
      pillar: pillarList[i % pillarList.length],
    });
  }
  return slots;
}
