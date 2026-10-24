/** Shared (client + server safe) types and constants for Content Studio / Calendar / Library. */

export const PLATFORMS = ['instagram', 'facebook', 'linkedin', 'x', 'paid_ads', 'email'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
  paid_ads: 'Paid Ads',
  email: 'Email',
};

export const FORMATS = [
  'post',
  'carousel',
  'reel',
  'product_promotion',
  'campaign',
  'ad_copy',
  'email',
] as const;
export type ContentFormat = (typeof FORMATS)[number];

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  post: 'Post',
  carousel: 'Carousel',
  reel: 'Reel concept & script',
  product_promotion: 'Product promotion',
  campaign: 'Marketing campaign',
  ad_copy: 'Ad copy',
  email: 'Email copy',
};

export const FORMATS_BY_PLATFORM: Record<Platform, ContentFormat[]> = {
  instagram: ['post', 'carousel', 'reel', 'product_promotion', 'campaign'],
  facebook: ['post', 'product_promotion', 'campaign'],
  linkedin: ['post', 'campaign'],
  x: ['post', 'campaign'],
  paid_ads: ['ad_copy', 'campaign'],
  email: ['email', 'campaign'],
};

export const OBJECTIVES = [
  { id: 'brand_awareness', label: 'Brand awareness' },
  { id: 'lead_generation', label: 'Lead generation' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'product_launch', label: 'Product launch' },
  { id: 'website_traffic', label: 'Website traffic' },
  { id: 'educational', label: 'Educational content' },
] as const;
export type ObjectiveId = (typeof OBJECTIVES)[number]['id'];

export const ASPECT_RATIOS = {
  '4:5': { label: '4:5 portrait', width: 1080, height: 1350 },
  '1:1': { label: '1:1 square', width: 1080, height: 1080 },
  '9:16': { label: '9:16 vertical', width: 1080, height: 1920 },
} as const;
export type AspectRatio = keyof typeof ASPECT_RATIOS;

export function defaultAspectRatio(platform: Platform, format: ContentFormat): AspectRatio {
  if (format === 'reel') return '9:16';
  if (platform === 'instagram') return '4:5';
  return '1:1';
}

export const STATUSES = ['draft', 'in_review', 'approved', 'published'] as const;
export type ContentStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  approved: 'Approved',
  published: 'Published',
};

export interface CreativeBrief {
  composition: string;
  colors: string[];
  typography: string;
  imagery: string;
  textOverlay: string;
  logoPlacement: string;
}

export interface ContentPayload {
  title: string;
  platform: Platform;
  format: ContentFormat;
  objective: string;
  audienceEstimate: string;
  creativeConcept: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  visualDirection: string;
  textOverlay: string;
  imagePrompt: string;
  creativeBrief: CreativeBrief;
  /** Things the model had to assume or estimate. Always shown to the user. */
  assumptions: string[];
  carouselSlides?: { heading: string; body: string }[];
  reelScript?: { scene: string; voiceover: string; onScreen: string }[];
  emailSubject?: string;
  adHeadline?: string;
  adDescription?: string;
}

/** Editable text sections that can be regenerated individually. */
export const REGENERABLE_FIELDS = [
  'title',
  'creativeConcept',
  'hook',
  'caption',
  'cta',
  'hashtags',
  'visualDirection',
  'textOverlay',
  'imagePrompt',
  'creativeBrief',
] as const;
export type RegenerableField = (typeof REGENERABLE_FIELDS)[number];

export interface ContentItemRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  kind: 'studio' | 'calendar';
  status: ContentStatus;
  content: ContentPayload;
  aspectRatio: AspectRatio;
  campaign?: string;
  planId?: string;
  pillar?: string;
  topic?: string;
  /** YYYY-MM-DD in the user's time zone. Calendar entries only. */
  scheduledDate?: string;
  timezone?: string;
  /** Only the model that really produced the text. Omitted otherwise. */
  modelUsed?: string;
  /** Set only when the user explicitly records that it was published. */
  publishedRecordedAt?: string;
  /** Reserved for real stored image assets. Never a placeholder. */
  imageAssetUrl?: string;
  createdAt: string;
  updatedAt: string;
}
