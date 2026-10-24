import * as cheerio from 'cheerio';
import { URL } from 'node:url';
import { extractBrandColors, ExtractedColorItem, ColorExtractionDiagnostics } from './colorExtractor.ts';
import { discoverBrandLogo, LogoCandidate, LogoDiscoveryResult } from './logoDiscoverer.ts';
import { captureWebsiteSnapshot, WebsiteSnapshotResult } from './screenshotService.ts';
import { safeJsonParse } from './jsonUtils.ts';

export interface ExtractedVisualIdentity {
  colors: ExtractedColorItem[];
  fonts: Array<{
    family: string;
    source: string;
    weights?: string[];
  }>;
  logos: string[];
  heroImages: string[];
  diagnostics?: ColorExtractionDiagnostics;
  unreliableColors?: boolean;
  colorFallbackReason?: string;
}

export interface ExtractedProduct {
  name: string;
  description: string;
  price?: string;
  currency?: string;
  imageUrl?: string;
  productUrl?: string;
  category?: string;
  availability?: string;
}

export interface ExtractedSeoData {
  title: string | null;
  hasTitle: boolean;
  titleLength: number;
  metaDescription: string | null;
  hasMetaDescription: boolean;
  descriptionLength: number;
  canonicalUrl: string | null;
  hasCanonical: boolean;
  h1Tags: string[];
  h1Count: number;
  h2Count: number;
  h3Count: number;
  totalImages: number;
  imagesWithoutAlt: number;
  missingAltPercentage: number;
  hasMobileViewport: boolean;
  viewportContent: string | null;
  robotsDirective: string | null;
  openGraph: {
    title: string | null;
    description: string | null;
    image: string | null;
    type: string | null;
    siteName: string | null;
  };
  issues: Array<{
    id: string;
    title: string;
    severity: 'critical' | 'warning' | 'info' | 'good';
    evidence: string;
    recommendation: string;
  }>;
}

export interface ExtractedWebsiteData {
  url: string;
  businessIdentity: {
    name: string | null;
    nameSource: string;
    title: string | null;
    description: string | null;
    logoUrl: string | null;
    logoSource: string;
    logoStatus: 'verified' | 'unverified' | 'fallback';
    logoCandidates: LogoCandidate[];
    logoLastCheckedAt: string;
    faviconUrl: string | null;
    canonicalUrl: string | null;
    language: string | null;
    ogImage: string | null;
  };
  visualIdentity: ExtractedVisualIdentity;
  snapshot: WebsiteSnapshotResult;
  businessInfo: {
    headings: string[];
    bodySnippets: string[];
    contactUrl: string | null;
    socialLinks: {
      twitter?: string;
      linkedin?: string;
      facebook?: string;
      instagram?: string;
      youtube?: string;
      github?: string;
      tiktok?: string;
    };
  };
  seo: ExtractedSeoData;
  ecommerce: {
    isEcommerce: boolean;
    confidence: 'high' | 'medium' | 'low' | 'none';
    products: ExtractedProduct[];
  };
}

function resolveUrl(relative: string | null | undefined, base: string): string | null {
  if (!relative) return null;
  try {
    return new URL(relative, base).toString();
  } catch {
    return null;
  }
}

/**
 * Parses raw HTML, crawls external stylesheets, discovers verified logos and snapshots,
 * and extracts brand, SEO, visual, and commerce data.
 */
export async function extractWebsiteData(html: string, baseUrl: string): Promise<ExtractedWebsiteData> {
  const $ = cheerio.load(html);

  // 1. Basic Metadata
  const rawTitle = $('title').first().text().trim() || null;
  const metaDescription =
    $('meta[name="description" i]').attr('content')?.trim() ||
    $('meta[property="og:description" i]').attr('content')?.trim() ||
    null;
  const canonicalTag = $('link[rel="canonical" i]').attr('href')?.trim() || null;
  const canonicalUrl = resolveUrl(canonicalTag, baseUrl);
  const language = $('html').attr('lang') || $('meta[http-equiv="content-language" i]').attr('content') || null;

  // Open Graph
  const ogTitle = $('meta[property="og:title" i]').attr('content')?.trim() || null;
  const ogDescription = $('meta[property="og:description" i]').attr('content')?.trim() || null;
  const rawOgImage = $('meta[property="og:image" i]').attr('content')?.trim();
  const ogImage = resolveUrl(rawOgImage, baseUrl);
  const ogType = $('meta[property="og:type" i]').attr('content')?.trim() || null;
  const ogSiteName = $('meta[property="og:site_name" i]').attr('content')?.trim() || null;

  // Robots & Viewport
  const robotsDirective = $('meta[name="robots" i]').attr('content')?.trim() || null;
  const viewportContent = $('meta[name="viewport" i]').attr('content')?.trim() || null;
  const hasMobileViewport = Boolean(viewportContent && viewportContent.includes('width=device-width'));

  // Favicon
  const faviconRel = $('link[rel="icon" i], link[rel="shortcut icon" i], link[rel="apple-touch-icon" i]').first().attr('href');
  const faviconUrl = resolveUrl(faviconRel, baseUrl) || resolveUrl('/favicon.ico', baseUrl);

  // 2. Discover Structured Data (Schema.org)
  let schemaOrgName: string | null = null;
  const detectedProducts: ExtractedProduct[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).text();
      if (!text) return;
      const parsed = safeJsonParse<any>(text, null);
      if (!parsed) return;
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);

      for (const item of items) {
        if (!item) continue;
        const type = item['@type'];

        // Organization / LocalBusiness
        if (type === 'Organization' || type === 'LocalBusiness' || type === 'Corporation' || type === 'Store' || type === 'Brand') {
          if (item.name && typeof item.name === 'string') {
            schemaOrgName = item.name;
          }
        }

        // Product
        if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
          const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          detectedProducts.push({
            name: String(item.name || 'Unnamed Product'),
            description: String(item.description || '').slice(0, 300),
            price: offer?.price ? String(offer.price) : undefined,
            currency: offer?.priceCurrency || undefined,
            imageUrl:
              resolveUrl(
                Array.isArray(item.image) ? item.image[0] : typeof item.image === 'string' ? item.image : item.image?.url,
                baseUrl
              ) || undefined,
            productUrl: resolveUrl(item.url, baseUrl) || undefined,
            category: typeof item.category === 'string' ? item.category : undefined,
            availability: offer?.availability ? String(offer.availability).replace('https://schema.org/', '') : undefined,
          });
        }
      }
    } catch {
      // ignore JSON-LD parse errors
    }
  });

  // Business Name Heuristic
  let businessName: string | null = schemaOrgName || ogSiteName;
  let nameSource = schemaOrgName
    ? 'Schema.org JSON-LD'
    : ogSiteName
    ? 'OpenGraph og:site_name'
    : 'Title tag heuristic';

  if (!businessName && rawTitle) {
    const parts = rawTitle.split(/[-|•:–—]/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      businessName = parts[parts.length - 1].length < 30 ? parts[parts.length - 1] : parts[0];
    }
  }

  if (!businessName) {
    try {
      const host = new URL(baseUrl).hostname.replace(/^www\./, '');
      const hostLabel: string = host.split('.')[0] || host;
      businessName = hostLabel.charAt(0).toUpperCase() + hostLabel.slice(1);
      nameSource = 'Domain name fallback';
    } catch {
      businessName = 'My Business';
      nameSource = 'Default fallback';
    }
  }

  // 3. Multi-Source Robust Brand Color Extraction Pipeline (Task 1)
  const colorExtraction = await extractBrandColors(html, baseUrl);

  // 4. Real Logo Discovery & Verification (Task 2)
  const logoDiscovery = await discoverBrandLogo(html, baseUrl);

  // 5. Website Snapshot Preview (Task 3)
  const snapshot = await captureWebsiteSnapshot(html, baseUrl);

  // 6. Font Families from Google Fonts and styles
  const detectedFonts: Set<string> = new Set();
  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('fonts.googleapis.com/css')) {
      try {
        const urlObj = new URL(href);
        const familyParam = urlObj.searchParams.get('family');
        if (familyParam) {
          const families = familyParam.split('|');
          for (const f of families) {
            const fontName = f.split(':')[0].replace(/\+/g, ' ');
            detectedFonts.add(fontName);
          }
        }
      } catch {
        // ignore
      }
    }
  });

  const fontFamilyRegex = /font-family\s*:\s*([^;!}]+)/gi;
  $('style').each((_, el) => {
    const content = $(el).text();
    let fontMatch: RegExpExecArray | null;
    while ((fontMatch = fontFamilyRegex.exec(content)) !== null) {
      const family = fontMatch[1].split(',')[0].replace(/['"]/g, '').trim();
      if (family && !['inherit', 'sans-serif', 'serif', 'monospace', 'initial'].includes(family.toLowerCase())) {
        detectedFonts.add(family);
      }
    }
  });

  const fontList = Array.from(detectedFonts).slice(0, 5).map(family => ({
    family,
    source: 'Detected in stylesheet/font declaration',
  }));

  // Hero / High-priority Images
  const heroImages: string[] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    const full = resolveUrl(src, baseUrl);
    if (full && !heroImages.includes(full) && !full.endsWith('.svg') && !full.includes('icon')) {
      heroImages.push(full);
    }
  });

  // Social Links
  const socialLinks: ExtractedWebsiteData['businessInfo']['socialLinks'] = {};
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.toLowerCase() || '';
    if (href.includes('twitter.com/') || href.includes('x.com/')) socialLinks.twitter = $(el).attr('href');
    if (href.includes('linkedin.com/')) socialLinks.linkedin = $(el).attr('href');
    if (href.includes('facebook.com/')) socialLinks.facebook = $(el).attr('href');
    if (href.includes('instagram.com/')) socialLinks.instagram = $(el).attr('href');
    if (href.includes('youtube.com/')) socialLinks.youtube = $(el).attr('href');
    if (href.includes('github.com/')) socialLinks.github = $(el).attr('href');
    if (href.includes('tiktok.com/')) socialLinks.tiktok = $(el).attr('href');
  });

  // Contact Page URL
  let contactUrl: string | null = null;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().toLowerCase();
    if (text.includes('contact') || href.toLowerCase().includes('contact')) {
      contactUrl = resolveUrl(href, baseUrl);
    }
  });

  // Headings
  const h1Tags: string[] = [];
  $('h1').each((_, el) => {
    const t = $(el).text().trim();
    if (t) h1Tags.push(t);
  });
  const h2Count = $('h2').length;
  const h3Count = $('h3').length;

  const headingsList: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length < 120 && !headingsList.includes(t)) {
      headingsList.push(t);
    }
  });

  // Body Snippets
  const bodySnippets: string[] = [];
  $('p').each((_, el) => {
    const t = $(el).text().trim().replace(/\s+/g, ' ');
    if (t && t.length >= 40 && t.length <= 400 && !bodySnippets.includes(t)) {
      bodySnippets.push(t);
    }
  });

  // SEO Analysis & Issues calculation
  const totalImages = $('img').length;
  let imagesWithoutAlt = 0;
  $('img').each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt === null || alt.trim() === '') {
      imagesWithoutAlt++;
    }
  });
  const missingAltPercentage = totalImages > 0 ? Math.round((imagesWithoutAlt / totalImages) * 100) : 0;

  const issues: ExtractedSeoData['issues'] = [];

  // Title check
  if (!rawTitle) {
    issues.push({
      id: 'missing-title',
      title: 'Missing Page Title Tag',
      severity: 'critical',
      evidence: 'No <title> tag was found on the homepage.',
      recommendation: 'Add a descriptive <title> tag (50-60 characters) communicating your primary brand and value proposition.',
    });
  } else if (rawTitle.length < 20) {
    issues.push({
      id: 'short-title',
      title: 'Short Page Title',
      severity: 'warning',
      evidence: `Title length is ${rawTitle.length} characters ("${rawTitle}").`,
      recommendation: 'Expand your title tag to 40-60 characters to include relevant keywords and clear branding.',
    });
  } else if (rawTitle.length > 70) {
    issues.push({
      id: 'long-title',
      title: 'Title Tag Truncation Risk',
      severity: 'info',
      evidence: `Title tag is ${rawTitle.length} characters, which may be truncated in search engine results.`,
      recommendation: 'Keep primary title under 60-70 characters to ensure full visibility on mobile and desktop search snippets.',
    });
  } else {
    issues.push({
      id: 'good-title',
      title: 'Optimal Title Tag Length',
      severity: 'good',
      evidence: `Title is ${rawTitle.length} characters: "${rawTitle}".`,
      recommendation: 'Maintain targeted keyword positioning in page titles across new marketing content.',
    });
  }

  // Meta description check
  if (!metaDescription) {
    issues.push({
      id: 'missing-meta-description',
      title: 'Missing Meta Description',
      severity: 'critical',
      evidence: 'No meta description tag was found on the page.',
      recommendation: 'Add a compelling meta description (140-160 characters) with a clear call-to-action to boost click-through rates.',
    });
  } else if (metaDescription.length < 50) {
    issues.push({
      id: 'short-meta-description',
      title: 'Brief Meta Description',
      severity: 'warning',
      evidence: `Meta description is only ${metaDescription.length} characters.`,
      recommendation: 'Aim for 120-160 characters to provide compelling context for search engine users.',
    });
  } else {
    issues.push({
      id: 'good-meta-description',
      title: 'Meta Description Present',
      severity: 'good',
      evidence: `Meta description contains ${metaDescription.length} characters.`,
      recommendation: 'Ensure your meta description aligns with current marketing campaigns and value propositions.',
    });
  }

  // Heading check
  if (h1Tags.length === 0) {
    issues.push({
      id: 'missing-h1',
      title: 'No H1 Heading Found',
      severity: 'critical',
      evidence: 'The page does not contain an <h1> element.',
      recommendation: 'Add a single, prominent <h1> tag that describes your core product or service offering.',
    });
  } else if (h1Tags.length > 1) {
    issues.push({
      id: 'multiple-h1',
      title: 'Multiple H1 Headings Detected',
      severity: 'warning',
      evidence: `Found ${h1Tags.length} <h1> tags on the homepage.`,
      recommendation: 'Consolidate down to a single <h1> heading per page for clearer topic hierarchy for search crawlers.',
    });
  } else {
    issues.push({
      id: 'good-h1',
      title: 'Single Focused H1 Heading',
      severity: 'good',
      evidence: `1 H1 tag detected: "${h1Tags[0]}".`,
      recommendation: 'Continue using clear heading hierarchies (H1 -> H2 -> H3) across your website pages.',
    });
  }

  // Image alt check
  if (totalImages > 0 && imagesWithoutAlt > 0) {
    issues.push({
      id: 'missing-alt-tags',
      title: 'Missing Image Alt Attributes',
      severity: missingAltPercentage > 40 ? 'warning' : 'info',
      evidence: `${imagesWithoutAlt} of ${totalImages} images (${missingAltPercentage}%) lack descriptive alt text.`,
      recommendation: 'Add descriptive alt text to all visual assets to improve accessibility and image search discoverability.',
    });
  } else if (totalImages > 0) {
    issues.push({
      id: 'good-alt-tags',
      title: 'All Images Contain Alt Text',
      severity: 'good',
      evidence: `All ${totalImages} images have alt attributes defined.`,
      recommendation: 'Keep maintaining descriptive alt tags on newly added visual assets.',
    });
  }

  // Mobile viewport
  if (!hasMobileViewport) {
    issues.push({
      id: 'missing-viewport',
      title: 'Missing Mobile Viewport Meta Tag',
      severity: 'critical',
      evidence: 'No <meta name="viewport" content="width=device-width..."> tag detected.',
      recommendation: 'Add a responsive viewport tag to ensure proper rendering and mobile usability scoring.',
    });
  }

  // Open Graph
  if (!ogTitle || !ogImage) {
    issues.push({
      id: 'incomplete-opengraph',
      title: 'Incomplete Social Share Meta (OpenGraph)',
      severity: 'info',
      evidence: `og:title: ${ogTitle ? 'Yes' : 'Missing'}, og:image: ${ogImage ? 'Yes' : 'Missing'}.`,
      recommendation: 'Define og:title, og:description, and high-resolution og:image for rich presentation when shared on LinkedIn, X, and messaging apps.',
    });
  }

  // E-commerce detection
  const isEcommerce =
    detectedProducts.length > 0 ||
    $('button, a').filter((_, el) => {
      const t = $(el).text().toLowerCase();
      return t.includes('add to cart') || t.includes('checkout') || t.includes('buy now');
    }).length > 0;

  const ecommerceConfidence = detectedProducts.length >= 2 ? 'high' : isEcommerce ? 'medium' : 'none';

  return {
    url: baseUrl,
    businessIdentity: {
      name: businessName,
      nameSource,
      title: rawTitle,
      description: metaDescription,
      logoUrl: logoDiscovery.logoUrl,
      logoSource: logoDiscovery.logoSource,
      logoStatus: logoDiscovery.logoStatus,
      logoCandidates: logoDiscovery.logoCandidates,
      logoLastCheckedAt: logoDiscovery.logoLastCheckedAt,
      faviconUrl,
      canonicalUrl,
      language,
      ogImage,
    },
    visualIdentity: {
      colors: colorExtraction.colors,
      fonts: fontList,
      logos: logoDiscovery.logoCandidates.map(c => c.url),
      heroImages: heroImages.slice(0, 4),
      diagnostics: colorExtraction.diagnostics,
      unreliableColors: colorExtraction.unreliable,
      colorFallbackReason: colorExtraction.fallbackReason,
    },
    snapshot,
    businessInfo: {
      headings: headingsList.slice(0, 15),
      bodySnippets: bodySnippets.slice(0, 8),
      contactUrl,
      socialLinks,
    },
    seo: {
      title: rawTitle,
      hasTitle: Boolean(rawTitle),
      titleLength: rawTitle?.length || 0,
      metaDescription,
      hasMetaDescription: Boolean(metaDescription),
      descriptionLength: metaDescription?.length || 0,
      canonicalUrl,
      hasCanonical: Boolean(canonicalUrl),
      h1Tags,
      h1Count: h1Tags.length,
      h2Count,
      h3Count,
      totalImages,
      imagesWithoutAlt,
      missingAltPercentage,
      hasMobileViewport,
      viewportContent,
      robotsDirective,
      openGraph: {
        title: ogTitle,
        description: ogDescription,
        image: ogImage,
        type: ogType,
        siteName: ogSiteName,
      },
      issues,
    },
    ecommerce: {
      isEcommerce,
      confidence: ecommerceConfidence,
      products: detectedProducts.slice(0, 8),
    },
  };
}
