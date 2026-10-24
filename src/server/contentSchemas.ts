import { z } from 'zod';
import {
  PLATFORMS, FORMATS, REGENERABLE_FIELDS, ASPECT_RATIOS,
  type ContentPayload, type Platform, type ContentFormat,
} from '../lib/contentTypes.ts';

/**
 * Validation + sanitising for Content Studio. Kept free of any AI SDK import so it can be unit tested.
 * Everything the model returns passes through toPayload() before it is rendered or saved.
 */
const MAX_TEXT = 1500;
export const cap = (v: unknown, n = MAX_TEXT): string => (typeof v === 'string' ? v.slice(0, n) : '');

// -------------------------------------------------------------
// Brand context: whitelisted, size-capped, treated as UNTRUSTED data
// -------------------------------------------------------------
export function sanitizeBrandContext(raw: any): Record<string, unknown> {
  const r = raw && typeof raw === 'object' ? raw : {};
  const list = (v: unknown, n = 8) => (Array.isArray(v) ? v.slice(0, n) : []);
  const str = (v: unknown, n = 300) => cap(v, n);
  const short = (o: any, keys: string[]) =>
    Object.fromEntries(
      keys
        .filter(k => o && typeof o[k] !== 'undefined')
        .map(k => [
          k,
          typeof o[k] === 'string' ? str(o[k])
            : Array.isArray(o[k]) ? o[k].slice(0, 5).map((x: unknown) => str(x, 160))
            : typeof o[k] === 'number' || typeof o[k] === 'boolean' ? o[k]
            : undefined,
        ])
    );
  return {
    businessName: str(r.businessName, 120),
    websiteUrl: str(r.websiteUrl, 300),
    industry: str(r.industry, 120),
    businessDescription: str(r.businessDescription, 800),
    brandVoice: r.brandVoice ? str(JSON.stringify(r.brandVoice), 1200) : undefined,
    targetAudienceHypotheses: list(r.targetAudienceHypotheses, 5).map((a: any) => (typeof a === 'string' ? str(a) : short(a, ['persona', 'painPoints', 'buyingMotivations', 'isHypothesis']))),
    valuePropositions: list(r.valuePropositions, 8).map((v: unknown) => str(v, 200)),
    mainProductsOrServices: list(r.mainProductsOrServices, 12).map((v: unknown) => str(v, 160)),
    products: list(r.products, 12).map((p: any) => short(p, ['name', 'description', 'price', 'currency'])),
    contentThemes: list(r.contentThemes, 8).map((t: any) => (typeof t === 'string' ? str(t) : short(t, ['title', 'description', 'samplePostAngles']))),
    colors: list(r.colors, 8).map((c: unknown) => str(c, 20)),
    fonts: list(r.fonts, 4).map((c: unknown) => str(c, 60)),
    recommendations: list(r.recommendations, 6).map((a: any) => (typeof a === 'string' ? str(a) : short(a, ['title', 'actionableSteps', 'description']))),
    websiteFindings: list(r.websiteFindings, 6).map((v: unknown) => str(v, 240)),
  };
}


// -------------------------------------------------------------
// Schemas (validated before anything is rendered or saved)
// -------------------------------------------------------------
const s = (max = 2000) => z.string().trim().max(max).catch('');
export const BriefSchema = z.object({
  composition: s(),
  colors: z.array(z.string().max(40)).max(8).catch([]),
  typography: s(500),
  imagery: s(),
  textOverlay: s(300),
  logoPlacement: s(300),
}).catch({ composition: '', colors: [], typography: '', imagery: '', textOverlay: '', logoPlacement: '' });

export const RawContentSchema = z.object({
  title: s(200),
  objective: s(120),
  audienceEstimate: s(500),
  creativeConcept: s(),
  hook: s(500),
  caption: s(6000),
  cta: s(300),
  hashtags: z.array(z.string().max(60)).max(30).catch([]),
  visualDirection: s(),
  textOverlay: s(300),
  imagePrompt: s(1500),
  creativeBrief: BriefSchema,
  assumptions: z.array(z.string().max(400)).max(12).catch([]),
  carouselSlides: z.array(z.object({ heading: s(200), body: s(800) })).max(12).optional().catch(undefined),
  reelScript: z.array(z.object({ scene: s(400), voiceover: s(600), onScreen: s(300) })).max(15).optional().catch(undefined),
  emailSubject: s(300).optional(),
  adHeadline: s(200).optional(),
  adDescription: s(500).optional(),
});

export function normalizeHashtags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const t of tags) {
    const clean = t.replace(/[^\p{L}\p{N}_#]/gu, '').replace(/^#*/, '#');
    if (clean.length > 1) out.add(clean);
  }
  return [...out].slice(0, 20);
}

export function toPayload(raw: unknown, platform: Platform, format: ContentFormat, objective: string): ContentPayload | null {
  const parsed = RawContentSchema.safeParse(raw);
  if (!parsed.success) return null;
  const d = parsed.data;
  // Require the essentials; an empty caption/hook is a failed generation, not content.
  if (!d.caption && !d.hook && !d.adDescription && !d.emailSubject) return null;
  const payload: ContentPayload = {
    title: d.title || d.hook.slice(0, 80) || 'Untitled',
    platform, // the user's selection wins over whatever the model echoed
    format,
    objective: d.objective || objective,
    audienceEstimate: d.audienceEstimate,
    creativeConcept: d.creativeConcept,
    hook: d.hook,
    caption: d.caption,
    cta: d.cta,
    hashtags: normalizeHashtags(d.hashtags),
    visualDirection: d.visualDirection,
    textOverlay: d.textOverlay,
    imagePrompt: d.imagePrompt,
    creativeBrief: d.creativeBrief,
    assumptions: d.assumptions,
  };
  // Optional fields are only added when present (never `undefined`).
  if (format === 'carousel' && d.carouselSlides?.length) payload.carouselSlides = d.carouselSlides;
  if (format === 'reel' && d.reelScript?.length) payload.reelScript = d.reelScript;
  if (d.emailSubject) payload.emailSubject = d.emailSubject;
  if (d.adHeadline) payload.adHeadline = d.adHeadline;
  if (d.adDescription) payload.adDescription = d.adDescription;
  return payload;
}


// -------------------------------------------------------------
// Public request validation
// -------------------------------------------------------------
export const GenerateRequestSchema = z.object({
  platform: z.enum(PLATFORMS),
  format: z.enum(FORMATS),
  objective: z.string().trim().min(1).max(120),
  topic: z.string().trim().max(400).default(''),
  audience: z.string().trim().max(400).default(''),
  tone: z.string().trim().max(200).default(''),
  language: z.string().trim().max(60).default('English'),
  cta: z.string().trim().max(200).default(''),
  variations: z.number().int().min(1).max(4).default(1),
  customRequest: z.string().trim().max(1500).default(''),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;


export const RegenerateSectionSchema = z.object({
  field: z.enum(REGENERABLE_FIELDS),
  instruction: z.string().trim().max(500).default(''),
  content: z.record(z.string(), z.unknown()),
  request: GenerateRequestSchema.partial().optional(),
});


export const CalendarRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.union([z.literal(7), z.literal(30)]),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(6),
  postsPerWeek: z.number().int().min(1).max(14),
  objective: z.string().trim().min(1).max(120),
  pillars: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  themes: z.string().trim().max(500).default(''),
  seasonalEvents: z.string().trim().max(500).default(''),
  tone: z.string().trim().max(200).default(''),
  language: z.string().trim().max(60).default('English'),
  timezone: z.string().trim().max(80).default(''),
});
export type CalendarRequest = z.infer<typeof CalendarRequestSchema>;


export const RegenerateEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(PLATFORMS),
  format: z.enum(FORMATS),
  pillar: z.string().trim().max(80).default('General'),
  objective: z.string().trim().min(1).max(120),
  instruction: z.string().trim().max(500).default(''),
  tone: z.string().trim().max(200).default(''),
  language: z.string().trim().max(60).default('English'),
});


export const ImageRequestSchema = z.object({
  prompt: z.string().trim().min(5).max(1500),
  aspectRatio: z.enum(Object.keys(ASPECT_RATIOS) as ['4:5', '1:1', '9:16']),
});

