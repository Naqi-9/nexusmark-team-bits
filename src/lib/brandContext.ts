import type { BrandProfileRecord, ProductRecord, WorkspaceRecord } from '../services/workspaceService.ts';

/**
 * Builds the Gemma context from the workspace's REAL saved data only. Nothing is invented here:
 * missing data stays missing and the server prompt tells the model not to fill the gaps with facts.
 */
export function buildBrandContext(
  workspace: Pick<WorkspaceRecord, 'id' | 'name' | 'websiteUrl'>,
  profile: BrandProfileRecord | null,
  products: ProductRecord[] = []
) {
  const p: any = profile || {};
  return {
    workspaceId: workspace.id,
    businessName: p.businessName || workspace.name,
    websiteUrl: workspace.websiteUrl,
    industry: p.industry || '',
    businessDescription: p.businessDescription || '',
    brandVoice: p.brandVoice,
    targetAudienceHypotheses: p.targetAudienceHypotheses || [],
    valuePropositions: p.valuePropositions || [],
    mainProductsOrServices: p.mainProductsOrServices || [],
    products: products.slice(0, 12).map(x => ({ name: x.name, description: x.description, price: x.price, currency: x.currency })),
    contentThemes: p.contentThemes || [],
    colors: (p.visualIdentity?.colors || []).map((c: any) => c?.hex).filter(Boolean),
    fonts: (p.visualIdentity?.fonts || []).map((f: any) => f?.family).filter(Boolean),
    recommendations: [...(p.top3PriorityActions || []), ...(p.marketingOpportunities || [])],
    websiteFindings: [
      ...(p.marketingStrengths || []),
      ...(p.weaknessesAndMissedOpportunities || []),
    ],
  };
}

export function brandPalette(profile: BrandProfileRecord | null): string[] {
  const hexes = ((profile as any)?.visualIdentity?.colors || []).map((c: any) => c?.hex).filter((h: unknown): h is string => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h));
  return hexes.length ? hexes.slice(0, 5) : [];
}

export function suggestedTone(profile: BrandProfileRecord | null): string {
  return (profile as any)?.brandVoice?.tone || '';
}

export function suggestedAudience(profile: BrandProfileRecord | null): string {
  return (profile as any)?.targetAudienceHypotheses?.[0]?.persona || '';
}

export function suggestedPillars(profile: BrandProfileRecord | null): string[] {
  const t: any[] = (profile as any)?.contentThemes || [];
  return t.map(x => x?.title).filter((x: unknown): x is string => typeof x === 'string' && !!x).slice(0, 4);
}
