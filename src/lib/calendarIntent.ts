import { PLATFORM_LABELS, FORMAT_LABELS, type Platform, type ContentPayload } from './contentTypes.ts';
import { addDays } from './contentPlanner.ts';

export const CALENDAR_SYNC_MARKER = 'Synced to Content Calendar';

export interface CalendarIntent {
  days: 7 | 30;
  platforms: Platform[];
  postsPerWeek: number;
}

const ACTION = /\b(generate|build|create|make|plan|prepare|draft|write|design|put together|set up|need|give me|prepare)\b/i;
const OBJECT = /\b(content|social|posting|post|marketing|editorial)\s+(calendar|schedule|plan)\b|\bcalendar\b/i;
const NOT_CALENDAR = /\b(audit|analy[sz]e|explain|what is|why)\b.*\bcalendar\b/i;

/** Returns null when the message is not asking for a content calendar. */
export function detectCalendarIntent(message: string): CalendarIntent | null {
  const m = (message || '').trim();
  if (m.length < 8 || m.length > 600) return null;
  if (!OBJECT.test(m) || !ACTION.test(m) || NOT_CALENDAR.test(m)) return null;

  const wantsMonth = /\b(30|thirty)[\s-]*(day|days)\b|\bmonth(ly)?\b|\b4[\s-]*weeks?\b/i.test(m);
  const days: 7 | 30 = wantsMonth ? 30 : 7;

  const found: Platform[] = [];
  if (/instagram|\big\b|insta\b/i.test(m)) found.push('instagram');
  if (/facebook|\bfb\b/i.test(m)) found.push('facebook');
  if (/linkedin/i.test(m)) found.push('linkedin');
  if (/\btwitter\b|\bx\b(?!\s*(?:axis|ray))/i.test(m)) found.push('x');
  if (/\bemail|newsletter/i.test(m)) found.push('email');
  if (/\bads?\b|paid/i.test(m) && /paid|ad copy|ads\b/i.test(m)) found.push('paid_ads');

  const perWeekMatch = /(\d{1,2})\s*(?:posts?|times?)\s*(?:a|per|\/)\s*week/i.exec(m);
  const postsPerWeek = perWeekMatch ? Math.min(14, Math.max(1, Number(perWeekMatch[1]))) : days === 7 ? 5 : 4;

  return {
    days,
    platforms: found.length ? [...new Set(found)].slice(0, 6) : ['instagram', 'facebook', 'linkedin'],
    postsPerWeek,
  };
}

export interface SummaryEntry {
  slot: { date: string; platform: string; format: string; pillar: string };
  topic: string;
  content: Pick<ContentPayload, 'hook' | 'title'>;
}

const oneLine = (s: string, n: number) => {
  const t = (s || '').replace(/\s+/g, ' ').replace(/\*/g, '').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** Chat message describing exactly what was written to the Content Calendar. Contains no asterisks. */
export function formatCalendarSummary(opts: {
  days: number;
  entries: SummaryEntry[];
  failedDates: string[];
}): string {
  const { days, entries, failedDates } = opts;
  const dates = entries.map(e => e.slot.date).sort();
  const platforms = [...new Set(entries.map(e => PLATFORM_LABELS[e.slot.platform as Platform] || e.slot.platform))];
  const lines: string[] = [
    `Your ${days}-day content calendar is ready and has been added to your Content Calendar section automatically.`,
    '',
    'OVERVIEW',
    `- ${entries.length} post${entries.length === 1 ? '' : 's'} planned from ${dates[0]} to ${dates[dates.length - 1]}`,
    `- Platforms: ${platforms.join(', ')}`,
    '- Every entry is saved as a draft that you can edit, approve or open in Content Studio',
    '',
    'SCHEDULE',
  ];
  entries.forEach((e, i) => {
    const fmt = FORMAT_LABELS[e.slot.format as keyof typeof FORMAT_LABELS] || e.slot.format;
    const plat = PLATFORM_LABELS[e.slot.platform as Platform] || e.slot.platform;
    lines.push(`${i + 1}. ${e.slot.date} | ${plat} | ${fmt}`);
    lines.push(`   Topic: ${oneLine(e.topic || e.content.title, 90)}`);
    if (e.content.hook) lines.push(`   Hook: ${oneLine(e.content.hook, 110)}`);
  });
  if (failedDates.length) {
    lines.push('', 'NOT GENERATED', `- ${failedDates.length} slot(s) could not be written (${failedDates.join(', ')}). Ask me to run the plan again for those dates.`);
  }
  lines.push('', `${CALENDAR_SYNC_MARKER}: ${entries.length} post${entries.length === 1 ? '' : 's'}.`);
  return lines.join('\n');
}


// -------------------------------------------------------------
// Converting the "Content Calendar" quick deliverable into calendar entries (no extra AI call)
// -------------------------------------------------------------

const DELIVERABLE_PLATFORM: Record<string, Platform> = {
  linkedin: 'linkedin',
  'twitter / x': 'x',
  twitter: 'x',
  x: 'x',
  instagram: 'instagram',
  facebook: 'facebook',
  'email newsletter': 'email',
  email: 'email',
};

export interface DeliverableCalendarEntry {
  index: number;
  date: string;
  topic: string;
  pillar: string;
  content: ContentPayload;
}

/** Maps a saved "content_calendar" deliverable to Content Calendar entries. Posts on unsupported channels are skipped and counted. */
export function deliverableToCalendarEntries(deliverable: any, startDate: string, objective = 'engagement'): { entries: DeliverableCalendarEntry[]; skipped: number } {
  const posts: any[] = Array.isArray(deliverable?.posts) ? deliverable.posts : [];
  const entries: DeliverableCalendarEntry[] = [];
  let skipped = 0;
  const str = (v: unknown, n = 2000) => (typeof v === 'string' ? v.replace(/\*/g, '').trim().slice(0, n) : '');
  posts.forEach((p, i) => {
    const platform = DELIVERABLE_PLATFORM[str(p?.platform, 40).toLowerCase()];
    const caption = str(p?.fullCaption, 6000);
    const hook = str(p?.hook, 500);
    if (!platform || (!caption && !hook)) { skipped++; return; }
    const dayMatch = /day\s*(\d{1,2})/i.exec(str(p?.dayOrDate, 60));
    const offset = dayMatch ? Math.max(0, Math.min(29, Number(dayMatch[1]) - 1)) : Math.min(29, i);
    const note = str(p?.visualCreativeNote, 600);
    const tags = (Array.isArray(p?.hashtags) ? p.hashtags : []).filter((t: unknown) => typeof t === 'string').map((t: string) => `#${t.replace(/[^\p{L}\p{N}_]/gu, '')}`).filter((t: string) => t.length > 1).slice(0, 20);
    const content: ContentPayload = {
      title: hook.slice(0, 80) || `${PLATFORM_LABELS[platform]} post`,
      platform,
      format: platform === 'email' ? 'email' : 'post',
      objective,
      audienceEstimate: '',
      creativeConcept: str(p?.contentPillar, 200),
      hook,
      caption,
      cta: str(p?.callToAction, 300),
      hashtags: tags,
      visualDirection: note,
      textOverlay: hook.slice(0, 90),
      imagePrompt: note || hook,
      creativeBrief: { composition: '', colors: [], typography: '', imagery: note, textOverlay: hook.slice(0, 90), logoPlacement: '' },
      assumptions: [],
    };
    entries.push({ index: i, date: addDays(startDate, offset), topic: hook.slice(0, 120) || content.title, pillar: str(p?.contentPillar, 80) || 'General', content });
  });
  return { entries, skipped };
}
