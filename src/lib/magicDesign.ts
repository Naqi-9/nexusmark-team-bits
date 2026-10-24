import type { ContentItemRecord, ContentPayload } from './contentTypes.ts';

/**
 * Builds the prompt for the AI image model from everything the calendar entry already decided
 * (concept, visual direction, imagery, brand colors). Text is NOT requested from the image model:
 * the headline and logo are drawn on top locally so spelling is always correct.
 */
export function buildImagePrompt(content: ContentPayload, palette: string[], businessName = ''): string {
  const base = content.imagePrompt?.trim() || [content.title, content.creativeConcept].filter(Boolean).join('. ');
  const parts = [
    base,
    content.visualDirection && `Visual direction: ${content.visualDirection}`,
    content.creativeBrief?.imagery && `Imagery: ${content.creativeBrief.imagery}`,
    content.creativeBrief?.composition && `Composition: ${content.creativeBrief.composition}`,
    businessName && `Brand: ${businessName}.`,
    palette.length ? `Use this brand palette: ${palette.slice(0, 5).join(', ')}.` : '',
  ].filter(Boolean) as string[];
  // The guard tail is appended AFTER trimming so a long brief can never cut it off.
  const tail = 'Photorealistic commercial photography with believable lighting, real materials and accurate proportions. One clear focal subject, uncluttered background, clean negative space for a headline. Do not invent packaging, labels or brand marks. No text, letters, numbers, watermarks or logos in the image.';
  const head = parts.join(' ').slice(0, MAX_PROMPT - tail.length - 1).trimEnd();
  return `${head} ${tail}`;
}

const MAX_PROMPT = 1500;

/** Upcoming calendar entries first (today onwards, soonest first), then past ones, newest first. */
export function sortCalendarForMagic(items: ContentItemRecord[], today: string): ContentItemRecord[] {
  const cal = items.filter(i => i.kind === 'calendar' && i.scheduledDate);
  const upcoming = cal.filter(i => (i.scheduledDate as string) >= today).sort((a, b) => (a.scheduledDate as string).localeCompare(b.scheduledDate as string));
  const past = cal.filter(i => (i.scheduledDate as string) < today).sort((a, b) => (b.scheduledDate as string).localeCompare(a.scheduledDate as string));
  return [...upcoming, ...past];
}
