/**
 * Heuristic guard against invented commercial facts. It does NOT prove copy is true; it flags
 * numbers, prices, discounts and testimonial language that do not appear in the brand context so
 * the user can verify them. Warnings are shown in the UI next to the generated content.
 */
const PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'price or currency amount', re: /(?:[$€£]|Rs\.?|PKR|USD)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:USD|PKR|Rs)\b/gi },
  { label: 'percentage or discount', re: /\b\d{1,3}\s?%|\b\d{1,3}\s?percent\b/gi },
  { label: 'discount or free-offer wording', re: /\b(?:discount|coupon|promo code|% off|free shipping|buy one get one|bogo|limited[- ]time offer)\b/gi },
  { label: 'testimonial or customer-result claim', re: /\b(?:customers? (?:say|love|report)|testimonial|clients? (?:saw|achieved)|rated \d|[\d,]+\+? (?:happy )?(?:customers|clients|users))\b/gi },
  { label: 'guarantee or certification claim', re: /\b(?:guaranteed?|clinically proven|certified|award[- ]winning|#1|number one)\b/gi },
];

export function findUnsupportedClaims(text: string, contextJson: string): string[] {
  const ctx = contextJson.toLowerCase();
  const warnings: string[] = [];
  for (const { label, re } of PATTERNS) {
    const seen = new Set<string>();
    for (const m of text.matchAll(re)) {
      const hit = m[0].trim();
      if (!ctx.includes(hit.toLowerCase()) && !seen.has(hit.toLowerCase())) {
        seen.add(hit.toLowerCase());
        warnings.push(`Contains a ${label} ("${hit}") that is not in your Brand DNA. Verify it before publishing.`);
      }
    }
  }
  return warnings;
}
