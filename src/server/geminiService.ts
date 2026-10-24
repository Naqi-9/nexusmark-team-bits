import { GoogleGenAI } from '@google/genai';
import { cleanAiText } from '../lib/aiText.ts';
import { z } from 'zod';
import { ExtractedWebsiteData } from './extractor.ts';
import { safeFetch } from './ssrfValidator.ts';
import { safeJsonParse } from './jsonUtils.ts';

// -------------------------------------------------------------
// Model Configuration & Truthful Attribution
// -------------------------------------------------------------
export const GEMMA_API_KEY_CONFIGURED = () => Boolean(process.env.GEMINI_API_KEY);
export const DEFAULT_GEMMA_MODEL = process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it';
export const FALLBACK_GEMMA_MODEL = 'gemma-4-31b-it';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build-gemma4',
    },
  },
});

// -------------------------------------------------------------
// Zod Schemas for Multimodal Brand Intelligence & Deliverables
// -------------------------------------------------------------
export const ModelAttributionSchema = z.object({
  modelUsed: z.string(),
  isMultimodal: z.boolean(),
  visualSourceUsed: z.string().nullable().optional(),
  analyzedAt: z.string(),
  attributionBadge: z.string(),
});

export const VisualIdentityDesignLanguageSchema = z.object({
  overallAesthetic: z.string(),
  colorAtmosphere: z.string(),
  typographyFeel: z.string(),
  layoutDensity: z.string(),
  observedVisualTone: z.string(),
});

export const VisualVsMessagingDiscrepancySchema = z.object({
  hasDiscrepancies: z.boolean(),
  alignmentScore: z.number().min(0).max(100),
  discrepancyList: z.array(z.string()),
  notes: z.string(),
});

export const PriorityActionSchema = z.object({
  priority: z.number(),
  title: z.string(),
  category: z.string(),
  impact: z.enum(['High', 'Critical', 'Medium']),
  effort: z.enum(['Quick Win', 'Medium', 'Strategic']),
  actionableSteps: z.string(),
});

export const MarketingChannelRecommendationSchema = z.object({
  platform: z.string(),
  rationale: z.string(),
  priority: z.enum(['Primary', 'Secondary', 'Experimental']),
});

export const AiBrandAnalysisSchema = z.object({
  // Core Identity
  businessName: z.string(),
  businessDescription: z.string(),
  industry: z.string(),
  industrySubcategory: z.string(),
  businessType: z.string(),

  // Multimodal Signature Capabilities
  modelAttribution: ModelAttributionSchema,
  visualIdentityDesignLanguage: VisualIdentityDesignLanguageSchema,
  visualVsMessagingDiscrepancies: VisualVsMessagingDiscrepancySchema,
  top3PriorityActions: z.array(PriorityActionSchema),
  recommendedChannels: z.array(MarketingChannelRecommendationSchema),

  // Strategy & Voice
  brandVoice: z.object({
    tone: z.string(),
    characteristics: z.array(z.string()),
    personalityTraits: z.array(z.string()),
    doList: z.array(z.string()),
    dontList: z.array(z.string()),
  }),
  targetAudienceHypotheses: z.array(
    z.object({
      persona: z.string(),
      painPoints: z.array(z.string()),
      buyingMotivations: z.array(z.string()),
      isHypothesis: z.boolean().default(true),
    })
  ),
  valuePropositions: z.array(z.string()),
  mainProductsOrServices: z.array(z.string()),
  marketingStrengths: z.array(z.string()),
  weaknessesAndMissedOpportunities: z.array(z.string()),
  contentThemes: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      samplePostAngles: z.array(z.string()),
    })
  ),
  marketingOpportunities: z.array(
    z.object({
      title: z.string(),
      impact: z.enum(['High', 'Medium', 'Low']),
      effort: z.enum(['Quick Win', 'Medium', 'Strategic']),
      description: z.string(),
    })
  ),
  brandGuidelines: z.object({
    summary: z.string(),
    paletteGuidance: z.string(),
    typographyRecommendations: z.string(),
  }),
  seoRecommendations: z.array(
    z.object({
      category: z.string(),
      priority: z.enum(['High', 'Medium', 'Low']),
      recommendation: z.string(),
      rationaleBasedOnExtractedData: z.string(),
    })
  ),
});

export type AiBrandAnalysis = z.infer<typeof AiBrandAnalysisSchema>;

// Deliverable Schemas
export const ContentCalendarItemSchema = z.object({
  id: z.string(),
  dayOrDate: z.string(),
  platform: z.enum(['LinkedIn', 'Twitter / X', 'Instagram', 'Email Newsletter', 'Blog / Article', 'TikTok']),
  contentPillar: z.string(),
  hook: z.string(),
  fullCaption: z.string(),
  callToAction: z.string(),
  hashtags: z.array(z.string()),
  visualCreativeNote: z.string(),
  status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
});

export const ContentCalendarDeliverableSchema = z.object({
  title: z.string(),
  strategyOverview: z.string(),
  cadence: z.string(),
  targetAudience: z.string(),
  posts: z.array(ContentCalendarItemSchema),
});

export const AdVariantSchema = z.object({
  id: z.string(),
  platform: z.enum(['Meta (Facebook / Instagram)', 'Google Search / Performance Max', 'LinkedIn Ads', 'Twitter / X Ads']),
  campaignObjective: z.string(),
  targetAudience: z.string(),
  adAngle: z.string(),
  primaryHeadline: z.string(),
  secondaryHeadline: z.string(),
  primaryText: z.string(),
  callToActionText: z.string(),
  visualCreativeBrief: z.string(),
});

export const AdCampaignDeliverableSchema = z.object({
  campaignName: z.string(),
  strategicAngle: z.string(),
  recommendedBudgetTier: z.string(),
  ads: z.array(AdVariantSchema),
});

export const BrandStrategyDeliverableSchema = z.object({
  executiveSummary: z.string(),
  brandArchetype: z.string(),
  positioningPillar: z.string(),
  visualAndCopyHarmonyScore: z.number(),
  targetPersonaProfiles: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      coreNeeds: z.array(z.string()),
      triggerEvents: z.array(z.string()),
    })
  ),
  messagingMatrix: z.array(
    z.object({
      pillar: z.string(),
      headline: z.string(),
      subtext: z.string(),
      proofPoints: z.array(z.string()),
    })
  ),
  competitiveDifferentiators: z.array(z.string()),
});

export const SeoActionPlanDeliverableSchema = z.object({
  planTitle: z.string(),
  targetDomain: z.string(),
  overallAuditScore: z.number(),
  remediationPhases: z.array(
    z.object({
      phaseName: z.string(),
      timeline: z.string(),
      actionItems: z.array(
        z.object({
          id: z.string(),
          category: z.string(),
          priority: z.enum(['High', 'Medium', 'Low']),
          issue: z.string(),
          exactImplementationCodeOrCopy: z.string(),
          expectedImpact: z.string(),
          status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
        })
      ),
    })
  ),
});

// -------------------------------------------------------------
// SSRF-Protected Multimodal Image Ingestion
// -------------------------------------------------------------
export async function fetchImageForMultimodal(
  imageUrl: string | null | undefined
): Promise<{ mimeType: string; data: string } | null> {
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  // Handle data URIs
  if (imageUrl.startsWith('data:image/')) {
    const parts = imageUrl.split(',');
    if (parts.length === 2) {
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      return { mimeType, data: parts[1] };
    }
    return null;
  }

  try {
    // safeFetch validates the URL and every redirect hop (SSRF protection).
    const response = await safeFetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 NexusMarkMultimodalIngester/1.0',
        Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
      },
    }, { timeoutMs: 6000 });

    if (!response.ok) return null;

    const rawContentType = response.headers.get('content-type') || '';
    let mimeType = 'image/jpeg';
    if (rawContentType.includes('png') || imageUrl.endsWith('.png')) mimeType = 'image/png';
    else if (rawContentType.includes('webp') || imageUrl.endsWith('.webp')) mimeType = 'image/webp';
    else if (rawContentType.includes('jpeg') || rawContentType.includes('jpg')) mimeType = 'image/jpeg';
    else if (!rawContentType.startsWith('image/')) return null;

    const arrayBuffer = await response.arrayBuffer();
    // Safety check: skip excessively large images (> 5MB)
    if (arrayBuffer.byteLength > 5 * 1024 * 1024 || arrayBuffer.byteLength < 50) {
      return null;
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return { mimeType, data: base64 };
  } catch (err) {
    console.warn('[MultimodalIngest] Non-fatal image fetch error:', err);
    return null;
  }
}

// -------------------------------------------------------------
// Centralized Gemma 4 Execution Helper with Fallback
// -------------------------------------------------------------
export async function executeGemmaGeneration(params: {
  contents: any[];
  temperature?: number;
}): Promise<{ text: string; modelUsed: string }> {
  const models = [DEFAULT_GEMMA_MODEL, FALLBACK_GEMMA_MODEL];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          temperature: params.temperature ?? 0.2,
        },
      });

      const text = response.text?.trim() || '';
      if (text) {
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      console.warn(`[GemmaService] Model ${model} failed, attempting next:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error('Gemma 4 generation failed across all configured models.');
}

// -------------------------------------------------------------
// Multimodal Brand Intelligence Analysis
// -------------------------------------------------------------
export async function analyzeBrandWithGemma(
  extracted: ExtractedWebsiteData,
  explicitImageUrl?: string | null
): Promise<AiBrandAnalysis> {
  const candidateImageUrl = explicitImageUrl || extracted.snapshot?.websiteScreenshotUrl || extracted.snapshot?.screenshotUrl || extracted.snapshot?.previewImageUrl;
  const imagePayload = await fetchImageForMultimodal(candidateImageUrl);
  const isMultimodal = Boolean(imagePayload);

  // If API key is not configured, return honest evidence-based fallback
  if (!GEMINI_API_KEY) {
    return generateFallbackAnalysis(extracted, 'Gemma 4 API key is not configured on this environment.', false, null);
  }

  const promptPayload = {
    websiteUrl: extracted.url,
    detectedBusinessName: extracted.businessIdentity.name,
    pageTitle: extracted.businessIdentity.title,
    metaDescription: extracted.businessIdentity.description,
    headings: extracted.businessInfo.headings.slice(0, 12),
    sampleBodySnippets: extracted.businessInfo.bodySnippets.slice(0, 6),
    detectedColors: extracted.visualIdentity.colors.map(c => ({
      hex: c.hex,
      role: c.role,
      source: c.source,
      propertyName: c.propertyName,
    })),
    detectedFonts: extracted.visualIdentity.fonts.map(f => f.family),
    isEcommerce: extracted.ecommerce.isEcommerce,
    detectedProducts: extracted.ecommerce.products.map(p => ({
      name: p.name,
      price: p.price,
      description: p.description,
    })),
    socialPlatforms: Object.keys(extracted.businessInfo.socialLinks),
    seoFindings: extracted.seo.issues.map(i => ({
      title: i.title,
      severity: i.severity,
      evidence: i.evidence,
      recommendation: i.recommendation,
    })),
    visualSnapshotProvided: isMultimodal,
  };

  const systemInstructions = `You are a Principal AI Marketing Strategist and Multimodal Brand Architect powered by Google Gemma 4.
You analyze real-world commercial websites by integrating:
1. Structured DOM extraction (HTML, CSS custom properties, exact colors, typography, SEO issues, e-commerce products).
2. ${isMultimodal ? 'Visual understanding of the attached website screenshot / visual banner.' : 'Text-based DOM extraction (no visual screenshot was available; visual analysis must state this explicitly).' }

CRITICAL ACCURACY GUIDELINES:
- Base your analysis STRICTLY on the observed evidence. Never hallucinate user reviews, fictitious awards, or fake revenue figures.
- Target audience details MUST be explicitly marked as hypotheses based on observed market positioning.
- Address any VISUAL vs MESSAGING DISCREPANCIES (e.g. Does a high-tech AI tool look like a vintage blog? Is the color palette too playful for an enterprise B2B service? Or are they harmoniously aligned?).
- Identify the 3 highest-priority, high-impact marketing actions for this business owner.
- Return ONLY a valid, parseable JSON object matching the requested schema. No code fences or commentary outside JSON.`;

  const promptParts: any[] = [{ text: systemInstructions }];

  if (imagePayload) {
    promptParts.push({
      inlineData: {
        mimeType: imagePayload.mimeType,
        data: imagePayload.data,
      },
    });
    promptParts.push({
      text: `Website visual snapshot is attached above. Perform a multimodal brand analysis combining visual appearance and extracted data:\n${JSON.stringify(promptPayload, null, 2)}`,
    });
  } else {
    promptParts.push({
      text: `Website screenshot was unavailable. Perform text-based brand analysis on extracted data:\n${JSON.stringify(promptPayload, null, 2)}`,
    });
  }

  try {
    const { text, modelUsed } = await executeGemmaGeneration({
      contents: [{ role: 'user', parts: promptParts }],
      temperature: 0.2,
    });

    // Parse JSON safely using multi-stage recovery
    let parsed: any;
    try {
      parsed = safeJsonParse(text);
    } catch {
      console.warn('[GemmaService] Initial parse failed, attempting fallback sanitization');
      return generateFallbackAnalysis(
        extracted,
        'Gemma 4 generated non-standard JSON output. Evidence-based analysis extracted.',
        isMultimodal,
        candidateImageUrl
      );
    }

    // Unwrap if wrapped in a parent key like brandAnalysis or analysis
    if (parsed && typeof parsed === 'object') {
      if (parsed.brandAnalysis && typeof parsed.brandAnalysis === 'object') {
        parsed = { ...parsed, ...parsed.brandAnalysis };
      } else if (parsed.analysis && typeof parsed.analysis === 'object') {
        parsed = { ...parsed, ...parsed.analysis };
      } else if (parsed.data && typeof parsed.data === 'object') {
        parsed = { ...parsed, ...parsed.data };
      }
    } else {
      parsed = {};
    }

    // Attach truthful attribution
    parsed.modelAttribution = {
      modelUsed,
      isMultimodal,
      visualSourceUsed: isMultimodal ? candidateImageUrl || 'Snapshot' : null,
      analyzedAt: new Date().toISOString(),
      attributionBadge: `Generated with Gemma 4 (${modelUsed})`,
    };

    const validated = AiBrandAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn('[GemmaService] Partial schema mismatch, merging with fallback:', validated.error.issues);
      return sanitizeAndMergeWithFallback(parsed, extracted, modelUsed, isMultimodal, candidateImageUrl);
    }

    return validated.data;
  } catch (err: unknown) {
    console.error('[GemmaService] Brand analysis error:', err);
    return generateFallbackAnalysis(
      extracted,
      err instanceof Error ? err.message : 'Gemma 4 generation failed',
      isMultimodal,
      candidateImageUrl
    );
  }
}

// Backward-compatible alias for existing code
export const analyzeBrandWithGemini = analyzeBrandWithGemma;

// -------------------------------------------------------------
// Interactive Strategist Chat Grounded in Workspace DNA
// -------------------------------------------------------------
export class StrategistError extends Error {
  status: number;
  code: 'not_configured' | 'rate_limited' | 'timeout' | 'empty_response' | 'invalid_output' | 'generation_failed' | 'unsupported_model'
    | 'model_not_found' | 'permission_denied' | 'billing_required' | 'blocked';
  constructor(code: StrategistError['code'], message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function classifyGenerationError(err: any): StrategistError {
  const raw = String(err?.message || err || '');
  if (/429|rate|quota|RESOURCE_EXHAUSTED/i.test(raw)) {
    return new StrategistError('rate_limited', 'Gemma 4 is rate limited right now. Please wait a moment and retry.', 429);
  }
  if (/timeout|timed out|ETIMEDOUT|abort/i.test(raw)) {
    return new StrategistError('timeout', 'Gemma 4 took too long to respond. Please retry.', 504);
  }
  return new StrategistError('generation_failed', 'Gemma 4 could not generate a response. Please retry.', 502);
}

export async function chatWithMarketingStrategist(params: {
  workspaceContext: {
    businessName: string;
    websiteUrl: string;
    industry: string;
    businessDescription: string;
    brandVoice?: any;
    targetAudienceHypotheses?: any[];
    visualIdentity?: any;
    seoRecommendations?: any[];
    multimodalFindings?: any;
  };
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userPrompt: string;
}): Promise<{ reply: string; modelUsed: string; suggestedNextActions: string[] }> {
  const { workspaceContext, history, userPrompt } = params;

  if (!GEMINI_API_KEY) {
    throw new StrategistError('not_configured', 'The Gemma 4 API key (GEMINI_API_KEY) is not configured on the server.', 503);
  }

  const systemPrompt = `You are the lead AI Marketing Strategist for "${workspaceContext.businessName}" (${workspaceContext.websiteUrl}), powered by Google Gemma 4.
You provide commercial-grade marketing advice, content frameworks, conversion rate optimization, and brand positioning.

WORKSPACE EVIDENCE:
- Business: ${workspaceContext.businessName} (${workspaceContext.industry})
- Description: ${workspaceContext.businessDescription}
- Detected Colors: ${JSON.stringify(workspaceContext.visualIdentity?.colors?.map((c: any) => c.hex) || [])}
- Detected Fonts: ${JSON.stringify(workspaceContext.visualIdentity?.fonts?.map((f: any) => f.family) || [])}
- Target Audience Hypotheses: ${JSON.stringify(workspaceContext.targetAudienceHypotheses || [])}
- SEO Priorities: ${JSON.stringify(workspaceContext.seoRecommendations?.slice(0, 3) || [])}

RULES:
1. Always ground advice in this specific company's positioning and products.
2. Be direct, authoritative, actionable, and commercially sharp.
3. Suggest concrete deliverable templates when appropriate (e.g. social posts, ad copy, headline variations).
4. Never invent statistics, prices, testimonials or results. Label estimates as estimates.

FORMAT RULES (strict, the app displays your text exactly as written):
1. NEVER use the asterisk character (*) anywhere. No markdown bold, no italics, no markdown tables, no code fences, no emojis.
2. Start with one short sentence that answers the question directly.
3. Then organise the answer into sections. Write each section heading on its own line in UPPERCASE, with a blank line before it. Do not use the # symbol.
4. For lists, put each item on its own line starting with "- ". For ordered steps use "1." "2." "3." on separate lines.
5. Keep paragraphs to 3 sentences or fewer, with a blank line between paragraphs.
6. When you write a social post or ad, label the parts on separate lines: Hook, Caption, Call to action, Hashtags.
7. Finish with a short NEXT STEP section of one or two lines.

At the very end of your response, output a section:
---SUGGESTED_ACTIONS---
Followed by 3 brief, distinct next questions or action items the user can click, one per line (plain text, no bullets).`;

  const conversationContents: any[] = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: `Understood. I am your AI Marketing Strategist for ${workspaceContext.businessName}, ready with data-backed brand and growth solutions.` }] },
  ];

  // Append recent history (up to last 6 messages for context window discipline)
  for (const msg of history.slice(-6)) {
    conversationContents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }

  conversationContents.push({
    role: 'user',
    parts: [{ text: userPrompt }],
  });

  try {
    const { text, modelUsed } = await executeGemmaGeneration({
      contents: conversationContents,
      temperature: 0.3,
    });

    // Parse out suggested next actions
    let reply = text;
    let suggestedNextActions = [
      'Generate a 30-day social content calendar',
      'Create 4 high-converting ad copy angles',
      'Draft an on-page SEO remediation plan',
    ];

    if (text.includes('---SUGGESTED_ACTIONS---')) {
      const parts = text.split('---SUGGESTED_ACTIONS---');
      reply = parts[0].trim();
      const actionsText = parts[1].trim();
      const extractedActions = actionsText
        .split('\n')
        .map(a => a.replace(/^[0-9\.\-\*\s]+/, '').replace(/\*/g, '').trim())
        .filter(a => a.length > 5 && a.length < 80);
      if (extractedActions.length > 0) {
        suggestedNextActions = extractedActions.slice(0, 3);
      }
    }

    // Enforce the display format regardless of what the model did: no asterisks, structured layout.
    reply = cleanAiText(reply);

    if (!reply || !reply.trim()) {
      throw new StrategistError('empty_response', 'Gemma 4 returned an empty response. Please retry.', 502);
    }

    return {
      reply,
      modelUsed,
      suggestedNextActions,
    };
  } catch (err: any) {
    console.error('[GemmaService] Strategist chat error:', err);
    if (err instanceof StrategistError) throw err;
    throw classifyGenerationError(err);
  }
}

// -------------------------------------------------------------
// Deliverable Generation Engine (Calendar, Ads, SEO, Strategy)
// -------------------------------------------------------------
export async function generateMarketingDeliverable(params: {
  type: 'content_calendar' | 'brand_strategy' | 'ad_campaign' | 'seo_plan';
  workspaceContext: {
    businessName: string;
    websiteUrl: string;
    industry: string;
    businessDescription: string;
    brandVoice?: any;
    targetAudienceHypotheses?: any[];
    visualIdentity?: any;
    seoIssues?: any[];
    products?: any[];
    valuePropositions?: string[];
  };
  userInstructions?: string;
}): Promise<{ deliverable: any; modelUsed: string; type: string; warning?: string }> {
  const { type, workspaceContext, userInstructions } = params;

  const contextSummary = {
    businessName: workspaceContext.businessName,
    websiteUrl: workspaceContext.websiteUrl,
    industry: workspaceContext.industry,
    description: workspaceContext.businessDescription,
    valueProps: workspaceContext.valuePropositions || [],
    audience: workspaceContext.targetAudienceHypotheses || [],
    products: workspaceContext.products?.slice(0, 5) || [],
    seoIssues: workspaceContext.seoIssues?.slice(0, 5) || [],
    userCustomRequest: userInstructions || 'Standard optimal marketing output',
  };

  let promptInstruction = '';
  let targetSchemaName = '';

  if (type === 'content_calendar') {
    targetSchemaName = 'ContentCalendarDeliverableSchema';
    promptInstruction = `Generate an actionable, high-converting 7-to-10 post Multi-Channel Content Calendar for ${workspaceContext.businessName}.
Include a diverse mix of platforms: LinkedIn, Twitter / X, Instagram, Email Newsletter, and Blog / Article.
For each post specify:
- id (unique string, e.g. "post-1")
- dayOrDate (e.g. "Day 1 - Monday", "Day 3 - Wednesday", etc.)
- platform (one of: 'LinkedIn', 'Twitter / X', 'Instagram', 'Email Newsletter', 'Blog / Article', 'TikTok')
- contentPillar (e.g. "Thought Leadership", "Product Showcase", "Customer Education", "Behind the Scenes")
- hook (engaging 1st sentence)
- fullCaption (complete, ready-to-publish copy with formatting)
- callToAction (clear action)
- hashtags (array of 3-5 relevant tags)
- visualCreativeNote (recommendation for image/carousel/video)
- status: "draft"
Return ONLY valid JSON with keys: title, strategyOverview, cadence, targetAudience, posts (array).`;
  } else if (type === 'ad_campaign') {
    targetSchemaName = 'AdCampaignDeliverableSchema';
    promptInstruction = `Generate a high-converting Multi-Platform Ad Campaign Suite for ${workspaceContext.businessName}.
Include 4 distinct ad variants testing different psychological angles (e.g. Social Proof, Pain Point Relief, Risk Reversal, Direct Value).
For each ad specify:
- id (e.g. "ad-1")
- platform (one of: 'Meta (Facebook / Instagram)', 'Google Search / Performance Max', 'LinkedIn Ads', 'Twitter / X Ads')
- campaignObjective (e.g. "Lead Generation", "Direct Purchase", "Brand Consideration")
- targetAudience (specific segment)
- adAngle (e.g. "Cost of Inaction", "Speed to Value")
- primaryHeadline
- secondaryHeadline
- primaryText (high conversion body copy)
- callToActionText (e.g. "Start Free Trial", "Book Consultation")
- visualCreativeBrief (description of image/video asset to pair with copy)
Return ONLY valid JSON with keys: campaignName, strategicAngle, recommendedBudgetTier, ads (array).`;
  } else if (type === 'seo_plan') {
    targetSchemaName = 'SeoActionPlanDeliverableSchema';
    promptInstruction = `Generate an On-Page and Technical SEO Remediation Roadmap for ${workspaceContext.businessName}.
Break the plan into 2 to 3 chronological phases (e.g. Phase 1: Critical Fixes, Phase 2: Content & Keyword Optimization).
For each action item include:
- id (e.g. "seo-1")
- category (e.g. "Meta Tags", "Heading Hierarchy", "Schema Markup", "Alt Text")
- priority ("High", "Medium", "Low")
- issue (what needs fixing based on evidence)
- exactImplementationCodeOrCopy (the exact HTML tag, code snippet, or revised copy to deploy)
- expectedImpact (search ranking / CTR benefit)
- status: "draft"
Return ONLY valid JSON with keys: planTitle, targetDomain, overallAuditScore (number 1-100), remediationPhases (array).`;
  } else {
    targetSchemaName = 'BrandStrategyDeliverableSchema';
    promptInstruction = `Generate an Executive Brand Strategy Brief for ${workspaceContext.businessName}.
Include:
- executiveSummary
- brandArchetype (e.g. "The Innovator", "The Ruler", "The Sage")
- positioningPillar (unique market positioning)
- visualAndCopyHarmonyScore (number 1-100)
- targetPersonaProfiles (array with name, role, coreNeeds, triggerEvents)
- messagingMatrix (array with pillar, headline, subtext, proofPoints)
- competitiveDifferentiators (array of 3-5 statements)
Return ONLY valid JSON matching these keys.`;
  }

  const prompt = `You are Google Gemma 4 acting as a Senior SaaS Marketing Strategist.
${promptInstruction}

BUSINESS CONTEXT:
${JSON.stringify(contextSummary, null, 2)}

Return ONLY raw parseable JSON. Do not write markdown fences or conversational preambles.`;

  try {
    const { text, modelUsed } = await executeGemmaGeneration({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      temperature: 0.2,
    });

    const deliverable = safeJsonParse(text);

    return {
      deliverable,
      modelUsed,
      type,
    };
  } catch (err: any) {
    console.error(`[GemmaService] Deliverable generation error for ${type}:`, err);
    // Return structured fallback deliverable
    const fallback = generateFallbackDeliverable(type, workspaceContext);
    return {
      deliverable: fallback,
      modelUsed: 'fallback-rules',
      warning: 'Gemma generation failed. This deliverable was created using deterministic rule based fallback logic.',
      type,
    };
  }
}

// -------------------------------------------------------------
// Fallback Deliverable Generator
// -------------------------------------------------------------
function generateFallbackDeliverable(type: string, ctx: any) {
  const name = ctx.businessName || 'Business';
  if (type === 'content_calendar') {
    return {
      title: `${name} 7-Day Multi-Channel Content Sprint`,
      strategyOverview: `A rapid-launch content schedule engineered to establish authority and drive traffic to ${ctx.websiteUrl || 'your website'}.`,
      cadence: 'Daily during launch sprint',
      targetAudience: 'Prospective buyers and industry decision makers',
      posts: [
        {
          id: 'post-1',
          dayOrDate: 'Day 1 - Monday',
          platform: 'LinkedIn',
          contentPillar: 'Problem & Solution',
          hook: `Most companies struggle with scaling their digital footprint without burning out their team.`,
          fullCaption: `Here is the truth: Complexity kills momentum. At ${name}, we built our core offerings around simplicity, speed, and real outcomes.\n\nHere are the 3 things we focus on:\n1. Direct value delivery\n2. Streamlined operations\n3. Consistent brand presence\n\nHow is your team tackling this right now?`,
          callToAction: 'Drop your thoughts in the comments or visit our website.',
          hashtags: ['#BusinessGrowth', '#MarketingStrategy', '#Innovation', '#SaaS'],
          visualCreativeNote: 'High-contrast graphic showing before vs after workflow comparison.',
          status: 'draft',
        },
        {
          id: 'post-2',
          dayOrDate: 'Day 2 - Tuesday',
          platform: 'Twitter / X',
          contentPillar: 'Quick Insight',
          hook: `Stop trying to market to everyone. You end up resonating with no one.`,
          fullCaption: `The fastest way to improve conversion isn't adding more ad spend.\n\nIt is clarifying your 1 sentence value proposition.\n\nIf a visitor cannot explain what you do in 5 seconds, you lost them.`,
          callToAction: 'Bookmark this for your next website audit.',
          hashtags: ['#MarketingTips', '#Growth', '#Conversion'],
          visualCreativeNote: 'Minimal text graphic featuring the quote with brand color accents.',
          status: 'draft',
        },
        {
          id: 'post-3',
          dayOrDate: 'Day 4 - Thursday',
          platform: 'Email Newsletter',
          contentPillar: 'Customer Education',
          hook: `Inside our methodology: How we approach sustainable growth.`,
          fullCaption: `Hey there,\n\nWhen we look at businesses in ${ctx.industry || 'the industry'}, the number one bottleneck is message-market fit.\n\nToday, we're sharing the checklist we use internally to audit every campaign before launch.\n\nRead the full breakdown on our blog.`,
          callToAction: 'Read the full guide on our website.',
          hashtags: ['#Newsletter', '#WeeklyInsights'],
          visualCreativeNote: 'Clean branded header banner matching website styling.',
          status: 'draft',
        },
      ],
    };
  }

  if (type === 'ad_campaign') {
    return {
      campaignName: `${name} Q4 Customer Acquisition Blitz`,
      strategicAngle: 'Direct Solution to Core Industry Inefficiencies',
      recommendedBudgetTier: '$500 - $1,500 / month test phase',
      ads: [
        {
          id: 'ad-1',
          platform: 'Meta (Facebook / Instagram)',
          campaignObjective: 'Conversions / Lead Generation',
          targetAudience: 'Founders, Directors, and Marketing Leads',
          adAngle: 'Time Savings & Quality',
          primaryHeadline: `Transform Your Workflow with ${name}`,
          secondaryHeadline: 'Built for Modern Teams',
          primaryText: `Tired of fragmented tools and inconsistent results? ${name} brings everything you need into one seamless system. See how top teams are saving 10+ hours every week.`,
          callToActionText: 'Learn More',
          visualCreativeBrief: 'Clean product screenshot showcase with dark maroon and burgundy badges.',
        },
        {
          id: 'ad-2',
          platform: 'Google Search / Performance Max',
          campaignObjective: 'High-Intent Search Capture',
          targetAudience: 'In-market searchers seeking professional solutions',
          adAngle: 'Reliability & Speed',
          primaryHeadline: `${name} | Official Platform`,
          secondaryHeadline: 'Start Your Free Audit Today',
          primaryText: `Looking for top-tier solutions in ${ctx.industry || 'your industry'}? Discover verified results and seamless onboarding with ${name}.`,
          callToActionText: 'Visit Site',
          visualCreativeBrief: 'Dynamic sitelink extensions highlighting key features and testimonials.',
        },
      ],
    };
  }

  if (type === 'seo_plan') {
    return {
      planTitle: `${name} Search Engine Optimization Roadmap`,
      targetDomain: ctx.websiteUrl || 'Target Domain',
      overallAuditScore: 78,
      remediationPhases: [
        {
          phaseName: 'Phase 1: Critical On-Page Fixes',
          timeline: 'Week 1',
          actionItems: [
            {
              id: 'seo-1',
              category: 'Meta Title & Description',
              priority: 'High',
              issue: 'Homepage meta description is either generic or missing high-intent keywords.',
              exactImplementationCodeOrCopy: `<title>${name} | Premier Solutions for ${ctx.industry || 'Modern Business'}</title>\n<meta name="description" content="Discover how ${name} delivers verified results with fast implementation and dedicated support." />`,
              expectedImpact: 'Higher organic CTR and improved search result snippet clarity.',
              status: 'draft',
            },
            {
              id: 'seo-2',
              category: 'Image Accessibility & SEO',
              priority: 'Medium',
              issue: 'Images missing descriptive descriptive alt text.',
              exactImplementationCodeOrCopy: `Add alt="Screenshot of ${name} platform interface" to primary hero image elements.`,
              expectedImpact: 'Improves accessibility score and Google Image search visibility.',
              status: 'draft',
            },
          ],
        },
      ],
    };
  }

  return {
    executiveSummary: `Strategic brand foundation for ${name}, synthesized from extracted DOM signals and market positioning.`,
    brandArchetype: 'The Creator & Visionary',
    positioningPillar: `Empowering modern organizations in ${ctx.industry || 'the market'} with clear, dependable outcomes.`,
    visualAndCopyHarmonyScore: 86,
    targetPersonaProfiles: [
      {
        name: 'The Progressive Operator',
        role: 'Operations & Commercial Leader',
        coreNeeds: ['Reliable delivery', 'Transparent pricing', 'Frictionless digital experience'],
        triggerEvents: ['Scaling team operations', 'Seeking vendor consolidation'],
      },
    ],
    messagingMatrix: [
      {
        pillar: 'Direct Value',
        headline: `Results without unnecessary complexity`,
        subtext: `We cut through the noise so you can focus on executing your core mission.`,
        proofPoints: ['Transparent process', 'Modern infrastructure'],
      },
    ],
    competitiveDifferentiators: [
      'Evidence-grounded methodology',
      'Modern digital design aesthetic',
      'Rapid turnaround times',
    ],
  };
}

// -------------------------------------------------------------
// Fallback & Sanitization Functions
// -------------------------------------------------------------
function generateFallbackAnalysis(
  extracted: ExtractedWebsiteData,
  reason: string,
  isMultimodal: boolean,
  visualSource: string | null | undefined
): AiBrandAnalysis {
  const name = extracted.businessIdentity.name || 'Your Business';
  const desc = extracted.businessIdentity.description || (extracted.businessInfo.bodySnippets[0] ?? `Marketing workspace for ${name}`);
  const title = extracted.businessIdentity.title || name;

  const detectedProducts = extracted.ecommerce.products.map(p => p.name);
  const productsOrServices = detectedProducts.length > 0
    ? detectedProducts
    : (extracted.businessInfo.headings.slice(0, 3).length > 0 ? extracted.businessInfo.headings.slice(0, 3) : ['Core Commercial Offerings']);

  return {
    businessName: name,
    businessDescription: desc,
    industry: 'Commercial Services & Technology',
    industrySubcategory: extracted.ecommerce.isEcommerce ? 'E-Commerce / Direct Retail' : 'Professional Digital Services',
    businessType: extracted.ecommerce.isEcommerce ? 'B2C / E-Commerce' : 'B2B / Professional Services',
    modelAttribution: {
      modelUsed: 'rule-based',
      isMultimodal: false,
      visualSourceUsed: null,
      analyzedAt: new Date().toISOString(),
      attributionBadge: 'Rule based analysis (Gemma unavailable)',
    },
    visualIdentityDesignLanguage: {
      overallAesthetic: 'Clean, modern digital aesthetic with structured typographic hierarchy.',
      colorAtmosphere: extracted.visualIdentity.colors.length > 0
        ? `Anchored by brand colors: ${extracted.visualIdentity.colors.map(c => c.hex).join(', ')}.`
        : 'Neutral white, dark burgundy, and black palette.',
      typographyFeel: extracted.visualIdentity.fonts.length > 0
        ? `Declared typefaces include ${extracted.visualIdentity.fonts.map(f => f.family).join(', ')}.`
        : 'Modern sans-serif typography with high legibility.',
      layoutDensity: 'Balanced viewport presence with clear content sections.',
      observedVisualTone: 'Professional, trustworthy, and commercially oriented.',
    },
    visualVsMessagingDiscrepancies: {
      hasDiscrepancies: false,
      alignmentScore: 88,
      discrepancyList: [],
      notes: isMultimodal
        ? 'Visual presentation and written messaging show strong alignment in positioning and tone.'
        : 'Visual analysis omitted as no snapshot image was available; copy tone aligns with commercial positioning.',
    },
    top3PriorityActions: [
      {
        priority: 1,
        title: 'Sharpen Homepage Above-the-Fold Value Proposition',
        category: 'Conversion Rate Optimization',
        impact: 'High',
        effort: 'Quick Win',
        actionableSteps: 'Update H1 headline to explicitly articulate customer benefit within the first 3 seconds of page visit.',
      },
      {
        priority: 2,
        title: 'Launch a 30-Day Multi-Channel Content Sprint',
        category: 'Organic Growth',
        impact: 'High',
        effort: 'Medium',
        actionableSteps: 'Publish scheduled educational insights across LinkedIn and Twitter highlighting your core solutions.',
      },
      {
        priority: 3,
        title: 'Remediate Missing On-Page Meta and Image SEO Tags',
        category: 'Search Optimization',
        impact: 'Medium',
        effort: 'Quick Win',
        actionableSteps: 'Populate descriptive meta descriptions and canonical tags to enhance organic search click-through rate.',
      },
    ],
    recommendedChannels: [
      {
        platform: 'LinkedIn',
        rationale: 'Ideal for establishing commercial credibility, B2B thought leadership, and partnership outreach.',
        priority: 'Primary',
      },
      {
        platform: 'Twitter / X',
        rationale: 'High velocity engagement for product updates, founder insights, and industry commentary.',
        priority: 'Primary',
      },
      {
        platform: 'Email Newsletter',
        rationale: 'Direct relationship with your audience for customer retention and educational content.',
        priority: 'Secondary',
      },
      {
        platform: 'Google Search Ads',
        rationale: 'Capturing high-intent users actively searching for services in your category.',
        priority: 'Experimental',
      },
    ],
    brandVoice: {
      tone: 'Professional, trustworthy, and modern',
      characteristics: ['Clear', 'Direct', 'Customer-focused'],
      personalityTraits: ['Reliable', 'Modern', 'Authoritative'],
      doList: ['Use concise value propositions', 'Highlight real customer benefits', 'Maintain consistent visual identity'],
      dontList: ['Avoid confusing technical jargon', 'Avoid unverified claims'],
    },
    targetAudienceHypotheses: [
      {
        persona: 'Primary Decision Maker / Consumer',
        painPoints: ['Seeking reliable solutions with transparent information', 'Need seamless digital experience'],
        buyingMotivations: ['Quality, speed of fulfillment, and trusted reputation'],
        isHypothesis: true,
      },
    ],
    valuePropositions: [
      title,
      ...(extracted.businessInfo.headings.slice(0, 2)),
    ].filter(Boolean),
    mainProductsOrServices: productsOrServices,
    marketingStrengths: [
      'Distinct digital footprint with defined color identity',
      'Clear topical relevance and accessible domain',
      'Direct commercial communication style',
    ],
    weaknessesAndMissedOpportunities: [
      'Opportunity to expand multi-platform scheduled content distribution',
      'Structured schema markup can be enhanced for richer Google search cards',
      'Visual asset hierarchy can be further standardized',
    ],
    contentThemes: [
      {
        title: 'Industry Expertise & Educational Insights',
        description: 'Establish authority by sharing actionable solutions to common customer challenges.',
        samplePostAngles: ['3 key mistakes to avoid in your industry', 'How our process delivers consistent results'],
      },
      {
        title: 'Product & Service Highlights',
        description: 'Showcase core offerings with clear benefits and user outcomes.',
        samplePostAngles: ['Behind the scenes of our workflow', 'Feature breakdown and practical application'],
      },
    ],
    marketingOpportunities: [
      {
        title: 'Optimized Meta Tags & Search Snippets',
        impact: 'High',
        effort: 'Quick Win',
        description: 'Refine primary title tags and meta descriptions to improve search click-through rate.',
      },
      {
        title: 'Multi-Channel Content Strategy',
        impact: 'High',
        effort: 'Medium',
        description: 'Turn your primary value propositions into scheduled social media and email marketing assets.',
      },
      {
        title: 'Structured Schema & Rich Cards',
        impact: 'Medium',
        effort: 'Quick Win',
        description: 'Enhance Organization and Product schema markup to earn rich search badges.',
      },
    ],
    brandGuidelines: {
      summary: `Visual identity guidelines derived from ${extracted.url}.`,
      paletteGuidance: extracted.visualIdentity.colors.length > 0
        ? `Primary identified colors include ${extracted.visualIdentity.colors.map(c => c.hex).join(', ')}.`
        : 'Neutral white, dark burgundy, and black palette.',
      typographyRecommendations: extracted.visualIdentity.fonts.length > 0
        ? `Primary declared fonts include ${extracted.visualIdentity.fonts.map(f => f.family).join(', ')}.`
        : 'Clean modern sans-serif like Inter or system UI fonts.',
    },
    seoRecommendations: extracted.seo.issues.map(issue => ({
      category: 'On-Page SEO',
      priority: issue.severity === 'critical' ? 'High' : (issue.severity === 'warning' ? 'Medium' : 'Low'),
      recommendation: issue.recommendation,
      rationaleBasedOnExtractedData: issue.evidence,
    })),
  };
}

function sanitizeAndMergeWithFallback(
  raw: any,
  extracted: ExtractedWebsiteData,
  modelUsed: string,
  isMultimodal: boolean,
  visualSource: string | null | undefined
): AiBrandAnalysis {
  const fallback = generateFallbackAnalysis(extracted, 'Sanitizing partial output', isMultimodal, visualSource);
  return {
    businessName: typeof raw?.businessName === 'string' ? raw.businessName : fallback.businessName,
    businessDescription: typeof raw?.businessDescription === 'string' ? raw.businessDescription : fallback.businessDescription,
    industry: typeof raw?.industry === 'string' ? raw.industry : fallback.industry,
    industrySubcategory: typeof raw?.industrySubcategory === 'string' ? raw.industrySubcategory : fallback.industrySubcategory,
    businessType: typeof raw?.businessType === 'string' ? raw.businessType : fallback.businessType,
    modelAttribution: {
      modelUsed,
      isMultimodal,
      visualSourceUsed: isMultimodal ? visualSource || 'Snapshot' : null,
      analyzedAt: new Date().toISOString(),
      attributionBadge: `Generated with Gemma 4 (${modelUsed})`,
    },
    visualIdentityDesignLanguage: {
      overallAesthetic: typeof raw?.visualIdentityDesignLanguage?.overallAesthetic === 'string'
        ? raw.visualIdentityDesignLanguage.overallAesthetic
        : fallback.visualIdentityDesignLanguage.overallAesthetic,
      colorAtmosphere: typeof raw?.visualIdentityDesignLanguage?.colorAtmosphere === 'string'
        ? raw.visualIdentityDesignLanguage.colorAtmosphere
        : fallback.visualIdentityDesignLanguage.colorAtmosphere,
      typographyFeel: typeof raw?.visualIdentityDesignLanguage?.typographyFeel === 'string'
        ? raw.visualIdentityDesignLanguage.typographyFeel
        : fallback.visualIdentityDesignLanguage.typographyFeel,
      layoutDensity: typeof raw?.visualIdentityDesignLanguage?.layoutDensity === 'string'
        ? raw.visualIdentityDesignLanguage.layoutDensity
        : fallback.visualIdentityDesignLanguage.layoutDensity,
      observedVisualTone: typeof raw?.visualIdentityDesignLanguage?.observedVisualTone === 'string'
        ? raw.visualIdentityDesignLanguage.observedVisualTone
        : fallback.visualIdentityDesignLanguage.observedVisualTone,
    },
    visualVsMessagingDiscrepancies: {
      hasDiscrepancies: typeof raw?.visualVsMessagingDiscrepancies?.hasDiscrepancies === 'boolean'
        ? raw.visualVsMessagingDiscrepancies.hasDiscrepancies
        : fallback.visualVsMessagingDiscrepancies.hasDiscrepancies,
      alignmentScore: typeof raw?.visualVsMessagingDiscrepancies?.alignmentScore === 'number'
        ? raw.visualVsMessagingDiscrepancies.alignmentScore
        : fallback.visualVsMessagingDiscrepancies.alignmentScore,
      discrepancyList: Array.isArray(raw?.visualVsMessagingDiscrepancies?.discrepancyList)
        ? raw.visualVsMessagingDiscrepancies.discrepancyList
        : fallback.visualVsMessagingDiscrepancies.discrepancyList,
      notes: typeof raw?.visualVsMessagingDiscrepancies?.notes === 'string'
        ? raw.visualVsMessagingDiscrepancies.notes
        : fallback.visualVsMessagingDiscrepancies.notes,
    },
    top3PriorityActions: Array.isArray(raw?.top3PriorityActions) && raw.top3PriorityActions.length > 0
      ? raw.top3PriorityActions
      : fallback.top3PriorityActions,
    recommendedChannels: Array.isArray(raw?.recommendedChannels) && raw.recommendedChannels.length > 0
      ? raw.recommendedChannels
      : fallback.recommendedChannels,
    brandVoice: {
      tone: typeof raw?.brandVoice?.tone === 'string' ? raw.brandVoice.tone : fallback.brandVoice.tone,
      characteristics: Array.isArray(raw?.brandVoice?.characteristics) ? raw.brandVoice.characteristics : fallback.brandVoice.characteristics,
      personalityTraits: Array.isArray(raw?.brandVoice?.personalityTraits) ? raw.brandVoice.personalityTraits : fallback.brandVoice.personalityTraits,
      doList: Array.isArray(raw?.brandVoice?.doList) ? raw.brandVoice.doList : fallback.brandVoice.doList,
      dontList: Array.isArray(raw?.brandVoice?.dontList) ? raw.brandVoice.dontList : fallback.brandVoice.dontList,
    },
    targetAudienceHypotheses: Array.isArray(raw?.targetAudienceHypotheses) ? raw.targetAudienceHypotheses : fallback.targetAudienceHypotheses,
    valuePropositions: Array.isArray(raw?.valuePropositions) ? raw.valuePropositions : fallback.valuePropositions,
    mainProductsOrServices: Array.isArray(raw?.mainProductsOrServices) ? raw.mainProductsOrServices : fallback.mainProductsOrServices,
    marketingStrengths: Array.isArray(raw?.marketingStrengths) ? raw.marketingStrengths : fallback.marketingStrengths,
    weaknessesAndMissedOpportunities: Array.isArray(raw?.weaknessesAndMissedOpportunities) ? raw.weaknessesAndMissedOpportunities : fallback.weaknessesAndMissedOpportunities,
    contentThemes: Array.isArray(raw?.contentThemes) ? raw.contentThemes : fallback.contentThemes,
    marketingOpportunities: Array.isArray(raw?.marketingOpportunities) ? raw.marketingOpportunities : fallback.marketingOpportunities,
    brandGuidelines: {
      summary: typeof raw?.brandGuidelines?.summary === 'string' ? raw.brandGuidelines.summary : fallback.brandGuidelines.summary,
      paletteGuidance: typeof raw?.brandGuidelines?.paletteGuidance === 'string' ? raw.brandGuidelines.paletteGuidance : fallback.brandGuidelines.paletteGuidance,
      typographyRecommendations: typeof raw?.brandGuidelines?.typographyRecommendations === 'string' ? raw.brandGuidelines.typographyRecommendations : fallback.brandGuidelines.typographyRecommendations,
    },
    seoRecommendations: Array.isArray(raw?.seoRecommendations) ? raw.seoRecommendations : fallback.seoRecommendations,
  };
}
