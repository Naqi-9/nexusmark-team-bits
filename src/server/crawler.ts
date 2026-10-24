import * as cheerio from 'cheerio';
import { URL } from 'node:url';
import { safeFetchHtml } from './ssrfValidator.ts';
import { extractWebsiteData, ExtractedWebsiteData } from './extractor.ts';

export interface CrawlResult {
  primaryData: ExtractedWebsiteData;
  pagesScanned: number;
  scannedUrls: string[];
  durationMs: number;
}

/**
 * Crawls a website starting at the homepage and extracting brand and SEO data.
 * Explores a small set of internal pages (e.g. /about, /services, /products) if accessible.
 */
export async function crawlWebsite(targetUrl: string, maxPages: number = 3): Promise<CrawlResult> {
  const startTime = Date.now();
  const scannedUrls: string[] = [];

  // 1. Fetch Homepage
  const homeFetch = await safeFetchHtml(targetUrl, 4 * 1024 * 1024, 10000);
  scannedUrls.push(targetUrl);

  const primaryData = await extractWebsiteData(homeFetch.html, targetUrl);

  // If page limit > 1, discover candidate internal pages
  if (maxPages > 1) {
    try {
      const $ = cheerio.load(homeFetch.html);
      const targetBase = new URL(targetUrl);
      const discoveredLinks: string[] = [];

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          const resolved = new URL(href, targetUrl);
          // Only crawl same origin and http/https
          if (resolved.origin === targetBase.origin && (resolved.protocol === 'http:' || resolved.protocol === 'https:')) {
            const cleanUrl = `${resolved.origin}${resolved.pathname}`;
            const pathLower = resolved.pathname.toLowerCase();

            // Prefer about, products, services, pricing, company pages
            const isValuable = (
              pathLower.includes('about') ||
              pathLower.includes('product') ||
              pathLower.includes('service') ||
              pathLower.includes('pricing') ||
              pathLower.includes('company')
            );

            if (isValuable && cleanUrl !== targetUrl && !discoveredLinks.includes(cleanUrl)) {
              discoveredLinks.push(cleanUrl);
            }
          }
        } catch {
          // ignore invalid URLs
        }
      });

      // Crawl up to (maxPages - 1) additional internal pages sequentially to avoid overwhelming target server
      for (const link of discoveredLinks.slice(0, maxPages - 1)) {
        try {
          const subFetch = await safeFetchHtml(link, 2 * 1024 * 1024, 8000);
          scannedUrls.push(link);
          const subData = await extractWebsiteData(subFetch.html, link);

          // Merge discovered products
          if (subData.ecommerce.products.length > 0) {
            for (const prod of subData.ecommerce.products) {
              if (!primaryData.ecommerce.products.some(p => p.name === prod.name)) {
                primaryData.ecommerce.products.push(prod);
              }
            }
            primaryData.ecommerce.isEcommerce = true;
          }

          // Merge headings and snippets for richer business context
          for (const heading of subData.businessInfo.headings) {
            if (!primaryData.businessInfo.headings.includes(heading) && primaryData.businessInfo.headings.length < 25) {
              primaryData.businessInfo.headings.push(heading);
            }
          }
          for (const snippet of subData.businessInfo.bodySnippets) {
            if (!primaryData.businessInfo.bodySnippets.includes(snippet) && primaryData.businessInfo.bodySnippets.length < 15) {
              primaryData.businessInfo.bodySnippets.push(snippet);
            }
          }
        } catch {
          // Failure on secondary page does not fail the primary crawl
        }
      }
    } catch {
      // Secondary link discovery is opportunistic
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    primaryData,
    pagesScanned: scannedUrls.length,
    scannedUrls,
    durationMs,
  };
}
