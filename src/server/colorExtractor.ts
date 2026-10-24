import postcss from 'postcss';
import * as cheerio from 'cheerio';
import { colord, extend } from 'colord';
import namesPlugin from 'colord/plugins/names';
import { URL } from 'node:url';
import { safeFetchHtml, validateAndNormalizeUrl } from './ssrfValidator.ts';

extend([namesPlugin]);

export interface ExtractedColorItem {
  hex: string;
  source: string;
  role: 'primary' | 'accent' | 'secondary' | 'background' | 'text' | 'detected';
  frequency: number;
  weight: number;
  isCustomProperty?: boolean;
  propertyName?: string;
}

export interface ColorExtractionDiagnostics {
  stylesheetsDiscovered: number;
  stylesheetsParsed: number;
  stylesheetsFailed: number;
  uniqueColorsFound: number;
  customPropertiesCount: number;
  metadataColorsCount: number;
  svgColorsCount: number;
  renderedAnalysisAvailable: boolean;
}

export interface ColorExtractionResult {
  colors: ExtractedColorItem[];
  diagnostics: ColorExtractionDiagnostics;
  unreliable: boolean;
  fallbackReason?: string;
}

// Target CSS properties likely to declare brand styling
const BRAND_RELEVANT_PROPS = new Set([
  'color',
  'background',
  'background-color',
  'border-color',
  'border',
  'outline-color',
  'outline',
  'text-decoration-color',
  'fill',
  'stroke',
  'box-shadow',
  'text-shadow',
]);

// Color pattern matching hex, rgb, rgba, hsl, hsla, var(...)
const COLOR_VAL_REGEX = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|var\(--[a-zA-Z0-9_-]+(?:,[^)]+)?\))/gi;

/**
 * Safely fetches an external CSS stylesheet with SSRF protection, size limits, and timeout.
 */
async function fetchStylesheetCss(cssUrl: string): Promise<string | null> {
  try {
    const val = await validateAndNormalizeUrl(cssUrl);
    if (!val.valid || !val.normalizedUrl) return null;

    // Fetch CSS using safeFetchHtml (handles SSRF, timeouts, 2MB size cap)
    const result = await safeFetchHtml(val.normalizedUrl, 2 * 1024 * 1024, 7000);
    return result.html;
  } catch (err) {
    console.warn(`[ColorExtractor] Could not fetch stylesheet ${cssUrl}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Determines whether a color is essentially pure white or near-white
 */
function isNearWhite(hex: string): boolean {
  const c = colord(hex);
  if (!c.isValid()) return false;
  const brightness = c.brightness();
  const saturation = c.toHsl().s;
  return brightness > 0.94 && saturation < 0.08;
}

/**
 * Determines whether a color is essentially pure black or near-black
 */
function isNearBlack(hex: string): boolean {
  const c = colord(hex);
  if (!c.isValid()) return false;
  return c.brightness() < 0.08;
}

/**
 * Robust, multi-source color extraction pipeline.
 */
export async function extractBrandColors(
  html: string,
  baseUrl: string,
  maxExternalStylesheets: number = 6
): Promise<ColorExtractionResult> {
  const $ = cheerio.load(html);
  const diagnostics: ColorExtractionDiagnostics = {
    stylesheetsDiscovered: 0,
    stylesheetsParsed: 0,
    stylesheetsFailed: 0,
    uniqueColorsFound: 0,
    customPropertiesCount: 0,
    metadataColorsCount: 0,
    svgColorsCount: 0,
    renderedAnalysisAvailable: false,
  };

  // Map of normalized uppercase HEX -> Accumulator
  const colorMap = new Map<
    string,
    {
      hex: string;
      sources: Set<string>;
      count: number;
      score: number;
      isCustomProp: boolean;
      customPropNames: Set<string>;
      hasBackgroundUse: boolean;
      hasAccentUse: boolean;
      hasFillUse: boolean;
    }
  >();

  // CSS Custom Properties Dictionary (--name -> raw value)
  const customProperties = new Map<string, string>();

  function registerRawColor(raw: string, source: string, propName: string = '', baseWeight: number = 1) {
    if (!raw) return;
    const trimmed = raw.trim();

    // Check if it's a CSS var reference: var(--name, fallback)
    if (trimmed.startsWith('var(')) {
      const varMatch = trimmed.match(/var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)/i);
      if (varMatch) {
        const varName = varMatch[1].toLowerCase();
        const fallback = varMatch[2]?.trim();
        const resolved = customProperties.get(varName) || fallback;
        if (resolved) {
          registerRawColor(resolved, `${source} (via ${varName})`, propName, baseWeight + 2);
        }
      }
      return;
    }

    const c = colord(trimmed);
    if (!c.isValid()) return;

    // Filter out transparent or very faint colors
    const alpha = c.alpha();
    if (alpha !== undefined && alpha < 0.15) return;

    const hex = c.toHex().toUpperCase();

    // Compute contextual weighting
    let weight = baseWeight;
    const lowerProp = propName.toLowerCase();

    const isCustomProp = lowerProp.startsWith('--');
    if (isCustomProp) {
      weight += 10;
      if (lowerProp.includes('primary') || lowerProp.includes('brand')) weight += 15;
      if (lowerProp.includes('accent')) weight += 10;
      if (lowerProp.includes('theme') || lowerProp.includes('main')) weight += 8;
    }

    const hasBackgroundUse = lowerProp.includes('background') || lowerProp === 'bg';
    if (hasBackgroundUse) weight += 5;

    const hasFillUse = lowerProp === 'fill' || lowerProp === 'stroke';
    if (hasFillUse) weight += 4;

    const hasAccentUse = lowerProp.includes('accent') || lowerProp.includes('border');
    if (hasAccentUse) weight += 3;

    if (!colorMap.has(hex)) {
      colorMap.set(hex, {
        hex,
        sources: new Set([source]),
        count: 1,
        score: weight,
        isCustomProp,
        customPropNames: isCustomProp ? new Set([lowerProp]) : new Set(),
        hasBackgroundUse,
        hasAccentUse,
        hasFillUse,
      });
    } else {
      const entry = colorMap.get(hex)!;
      entry.sources.add(source);
      entry.count += 1;
      entry.score += weight;
      if (isCustomProp) {
        entry.isCustomProp = true;
        entry.customPropNames.add(lowerProp);
      }
      if (hasBackgroundUse) entry.hasBackgroundUse = true;
      if (hasAccentUse) entry.hasAccentUse = true;
      if (hasFillUse) entry.hasFillUse = true;
    }
  }

  // 1. EXTRACT FROM METADATA
  const themeColorMeta = $('meta[name="theme-color" i]').attr('content')?.trim();
  if (themeColorMeta) {
    registerRawColor(themeColorMeta, 'Theme Color Metadata (<meta name="theme-color">)', '--meta-theme', 14);
    diagnostics.metadataColorsCount++;
  }

  const msTileColor = $('meta[name="msapplication-TileColor" i]').attr('content')?.trim();
  if (msTileColor) {
    registerRawColor(msTileColor, 'Windows Tile Color (<meta msapplication-TileColor>)', '--meta-tile', 10);
    diagnostics.metadataColorsCount++;
  }

  // 2. EXTRACT FROM SVG ASSETS & INLINE SVGS
  $('svg').each((_, el) => {
    const fillAttr = $(el).attr('fill');
    if (fillAttr && fillAttr !== 'none' && fillAttr !== 'currentColor') {
      registerRawColor(fillAttr, 'SVG Asset (fill attribute)', 'fill', 5);
      diagnostics.svgColorsCount++;
    }
    const strokeAttr = $(el).attr('stroke');
    if (strokeAttr && strokeAttr !== 'none' && strokeAttr !== 'currentColor') {
      registerRawColor(strokeAttr, 'SVG Asset (stroke attribute)', 'stroke', 4);
      diagnostics.svgColorsCount++;
    }

    $(el).find('path, circle, rect, polygon').each((_, child) => {
      const childFill = $(child).attr('fill');
      if (childFill && childFill !== 'none' && childFill !== 'currentColor') {
        registerRawColor(childFill, 'SVG Path Asset', 'fill', 4);
        diagnostics.svgColorsCount++;
      }
    });
  });

  // 3. EXTRACT FROM INLINE STYLES (style="...")
  $('[style]').each((_, el) => {
    const styleAttr = $(el).attr('style') || '';
    const decls = styleAttr.split(';');
    for (const decl of decls) {
      const colonIdx = decl.indexOf(':');
      if (colonIdx === -1) continue;
      const prop = decl.substring(0, colonIdx).trim().toLowerCase();
      const val = decl.substring(colonIdx + 1).trim();

      if (prop.startsWith('--')) {
        customProperties.set(prop, val);
        diagnostics.customPropertiesCount++;
        registerRawColor(val, 'Inline CSS Custom Property', prop, 8);
      } else if (BRAND_RELEVANT_PROPS.has(prop)) {
        const matches = val.match(COLOR_VAL_REGEX) || [];
        for (const m of matches) {
          registerRawColor(m, 'Inline Style Attribute', prop, 3);
        }
      }
    }
  });

  // Helper to parse CSS text using PostCSS AST safely
  function parseCssBlock(cssText: string, sourceName: string) {
    try {
      const root = postcss.parse(cssText);

      // Phase A: First collect all custom properties (--...)
      root.walkDecls(decl => {
        if (decl.prop.startsWith('--')) {
          const varName = decl.prop.toLowerCase();
          const varVal = decl.value.trim();
          customProperties.set(varName, varVal);
          diagnostics.customPropertiesCount++;
          // Check if value is a valid color
          if (colord(varVal).isValid()) {
            registerRawColor(varVal, `${sourceName} (${decl.prop})`, decl.prop, 12);
          }
        }
      });

      // Phase B: Walk standard declarations
      root.walkDecls(decl => {
        const prop = decl.prop.toLowerCase();
        if (BRAND_RELEVANT_PROPS.has(prop)) {
          const val = decl.value;
          const matches = val.match(COLOR_VAL_REGEX) || [];
          for (const m of matches) {
            registerRawColor(m, sourceName, prop, 4);
          }
        }
      });
    } catch {
      // Fallback regex scan if PostCSS encounters exotic CSS syntax
      const matches = cssText.match(COLOR_VAL_REGEX) || [];
      for (const m of matches) {
        registerRawColor(m, `${sourceName} (Regex Fallback)`, 'css-rule', 2);
      }
    }
  }

  // 4. EXTRACT FROM EMBEDDED <style> TAGS
  $('style').each((_, el) => {
    const content = $(el).text();
    if (content && content.trim()) {
      parseCssBlock(content, 'Embedded <style> block');
      diagnostics.stylesheetsParsed++;
    }
  });

  // 5. EXTRACT FROM EXTERNAL STYLESHEETS (<link rel="stylesheet">)
  const discoveredSheetUrls: string[] = [];
  $('link[rel="stylesheet" i]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    // Skip font stylesheet links for color extraction, but count them
    if (href.includes('fonts.googleapis.com')) return;

    try {
      const resolved = new URL(href, baseUrl).toString();
      if (!discoveredSheetUrls.includes(resolved)) {
        discoveredSheetUrls.push(resolved);
      }
    } catch {
      // ignore invalid URLs
    }
  });

  diagnostics.stylesheetsDiscovered = discoveredSheetUrls.length;

  // Fetch candidate stylesheets sequentially with cap
  const targetSheets = discoveredSheetUrls.slice(0, maxExternalStylesheets);
  for (const sheetUrl of targetSheets) {
    const cssContent = await fetchStylesheetCss(sheetUrl);
    if (cssContent && cssContent.trim()) {
      diagnostics.stylesheetsParsed++;
      let sheetShortName: string;
      try {
        const parsedUrl = new URL(sheetUrl);
        sheetShortName = parsedUrl.pathname.split('/').pop() || 'stylesheet.css';
      } catch {
        sheetShortName = 'external.css';
      }
      parseCssBlock(cssContent, `External CSS (${sheetShortName})`);

      // Follow @import depth 1 if present
      const importMatches = cssContent.match(/@import\s+(?:url\(['"]?([^'"()]+)['"]?\)|['"]([^'"]+)['"])/gi) || [];
      for (const imp of importMatches.slice(0, 2)) {
        const urlMatch = imp.match(/['"]([^'"]+)['"]/);
        if (urlMatch && urlMatch[1]) {
          try {
            const impResolved = new URL(urlMatch[1], sheetUrl).toString();
            if (!discoveredSheetUrls.includes(impResolved)) {
              const impCss = await fetchStylesheetCss(impResolved);
              if (impCss) {
                parseCssBlock(impCss, `Imported CSS (@import)`);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    } else {
      diagnostics.stylesheetsFailed++;
    }
  }

  diagnostics.uniqueColorsFound = colorMap.size;

  // 6. RANK AND GROUP COLORS
  const allEntries = Array.from(colorMap.values());

  // Split into distinct chromatic colors vs neutral black/whites
  const chromaticColors: typeof allEntries = [];
  const neutralColors: typeof allEntries = [];

  for (const item of allEntries) {
    if (isNearWhite(item.hex) || isNearBlack(item.hex)) {
      neutralColors.push(item);
    } else {
      chromaticColors.push(item);
    }
  }

  // Sort chromatic colors by score descending, then frequency
  chromaticColors.sort((a, b) => b.score - a.score || b.count - a.count);
  neutralColors.sort((a, b) => b.score - a.score || b.count - a.count);

  // Group very close colors (e.g. #81171A vs #81171B) to avoid duplicate shades
  const distinctPalette: typeof allEntries = [];
  function colorDistance(hex1: string, hex2: string): number {
    const rgb1 = colord(hex1).toRgb();
    const rgb2 = colord(hex2).toRgb();
    const rDiff = rgb1.r - rgb2.r;
    const gDiff = rgb1.g - rgb2.g;
    const bDiff = rgb1.b - rgb2.b;
    return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
  }

  function isDistinct(testHex: string) {
    for (const chosen of distinctPalette) {
      if (colorDistance(testHex, chosen.hex) < 24) {
        return false;
      }
    }
    return true;
  }

  for (const item of chromaticColors) {
    if (isDistinct(item.hex)) {
      distinctPalette.push(item);
    }
    if (distinctPalette.length >= 8) break;
  }

  // If we have fewer than 5 colors, append best-ranked neutrals (for background / text roles)
  if (distinctPalette.length < 5) {
    for (const item of neutralColors) {
      if (isDistinct(item.hex)) {
        distinctPalette.push(item);
      }
      if (distinctPalette.length >= 8) break;
    }
  }

  // Final role assignments
  const finalColors: ExtractedColorItem[] = distinctPalette.map((item, idx) => {
    let role: ExtractedColorItem['role'] = 'detected';
    if (idx === 0) {
      role = item.isCustomProp || item.hasBackgroundUse || item.score > 20 ? 'primary' : 'detected';
    } else if (idx === 1) {
      role = 'accent';
    } else if (idx === 2) {
      role = 'secondary';
    } else if (isNearWhite(item.hex)) {
      role = 'background';
    } else if (isNearBlack(item.hex)) {
      role = 'text';
    }

    const primarySource = Array.from(item.sources)[0] || 'Declared CSS';
    return {
      hex: item.hex,
      source: item.customPropNames.size > 0 
        ? `Custom Property (${Array.from(item.customPropNames)[0]})` 
        : primarySource,
      role,
      frequency: item.count,
      weight: item.score,
      isCustomProperty: item.isCustomProp,
      propertyName: Array.from(item.customPropNames)[0],
    };
  });

  const unreliable = finalColors.length === 0;

  return {
    colors: finalColors,
    diagnostics,
    unreliable,
    fallbackReason: unreliable 
      ? "We couldn't extract a reliable color palette from the accessible website stylesheets." 
      : undefined,
  };
}
