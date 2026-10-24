/**
 * Automated Verification Script for Phase 1.1 Enhancements
 * Tests color extraction, CSS custom properties, logo ranking, snapshot handling, and SSRF guardrails.
 */

import { extractBrandColors } from './colorExtractor.ts';
import { discoverBrandLogo } from './logoDiscoverer.ts';
import { captureWebsiteSnapshot } from './screenshotService.ts';
import { safeFetchHtml } from './ssrfValidator.ts';
import * as cheerio from 'cheerio';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } else {
    results.push({ name, passed: false, details });
    console.error(`  ✗ ${name}: ${details || 'Assertion failed'}`);
  }
}

async function runTests() {
  console.log('\n--- 1. Testing Multi-Source Brand Color Extraction ---');

  const testHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta name="theme-color" content="#2563eb">
      <style>
        :root {
          --brand-primary: #81171b;
          --accent-blue: #0284c7;
          --named-teal: teal;
          --hsl-color: hsl(210, 100%, 50%);
        }
        body {
          background-color: #ffffff;
          color: #111827;
        }
        .header {
          background: var(--brand-primary);
          color: #ffffff;
        }
        .hero {
          border-color: rgba(2, 132, 199, 0.9);
        }
      </style>
    </head>
    <body>
      <div style="background-color: #7c3aed; color: rgb(245, 158, 11);">
        <h1>Test Title</h1>
        <svg width="24" height="24">
          <circle cx="12" cy="12" r="10" fill="#ec4899" stroke="#10b981" />
        </svg>
      </div>
      <p style="background: #ffffff; color: #000000;">Near white and black elements</p>
    </body>
    </html>
  `;

  const colorResult = await extractBrandColors(testHtml, 'https://example.com');

  assert(colorResult.colors.length > 0, 'Extracts non-empty color palette');
  
  const hexes = colorResult.colors.map(c => c.hex.toLowerCase());
  assert(
    hexes.some(h => h === '#81171b'),
    'Discovers CSS custom property --brand-primary (#81171b)'
  );
  assert(
    hexes.some(h => h === '#7c3aed'),
    'Discovers inline style color (#7c3aed)'
  );
  assert(
    hexes.some(h => h === '#ec4899' || h === '#10b981'),
    'Discovers SVG fill or stroke color'
  );
  assert(
    hexes.some(h => h === '#2563eb'),
    'Discovers theme-color meta tag (#2563eb)'
  );
  assert(
    !hexes.includes('#ffffff'),
    'Excludes pure white (#ffffff) from primary brand palette'
  );

  console.log('\n--- 2. Testing Brand Logo Discovery & Ranking ---');

  const logoHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="apple-touch-icon" href="/icons/apple-touch.png">
      <link rel="icon" href="/favicon.ico">
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Acme Corp",
        "logo": "https://example.com/assets/schema-org-logo.svg"
      }
      </script>
    </head>
    <body>
      <header>
        <img src="/assets/header-logo.png" alt="Acme Corp Logo" class="brand-logo" />
      </header>
    </body>
    </html>
  `;

  const logoResult = await discoverBrandLogo(logoHtml, 'https://example.com');

  assert(logoResult.logoCandidates.length >= 2, 'Extracts multiple ranked logo candidates');
  const topCandidate = logoResult.logoCandidates[0];
  assert(
    topCandidate.source.toLowerCase().includes('schema'),
    'Ranks Schema.org Organization logo as highest priority candidate'
  );
  assert(
    topCandidate.url === 'https://example.com/assets/schema-org-logo.svg',
    'Resolves Schema.org logo URL correctly'
  );
  assert(
    logoResult.logoCandidates.some(c => c.url === 'https://example.com/assets/header-logo.png'),
    'Resolves relative header logo path to fully qualified URL'
  );

  console.log('\n--- 3. Testing Website Snapshot Capturing ---');

  const snapshotHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta property="og:image" content="https://example.com/images/hero-card.jpg" />
    </head>
    <body>
      <h1>Live Site</h1>
    </body>
    </html>
  `;

  const snapResult = await captureWebsiteSnapshot(snapshotHtml, 'https://example.com');

  assert(
    snapResult.previewImageUrl === 'https://example.com/images/hero-card.jpg' ||
    snapResult.screenshotUrl === 'https://example.com/images/hero-card.jpg' ||
    snapResult.screenshotStatus !== 'unavailable',
    'Extracts og:image for snapshot preview card'
  );

  console.log('\n--- 4. Testing SSRF Security & Protection ---');

  const blockedHosts = [
    'http://localhost:3000',
    'http://127.0.0.1:8080',
    'http://10.0.0.1/admin',
    'http://192.168.1.1',
    'http://169.254.169.254/latest/meta-data',
    'ftp://example.com',
    'file:///etc/passwd',
  ];

  for (const blocked of blockedHosts) {
    let errorCaught = false;
    try {
      await safeFetchHtml(blocked);
    } catch {
      errorCaught = true;
    }
    assert(errorCaught, `Blocks dangerous / private URL: ${blocked}`);
  }

  console.log('\n=============================================');
  const passedCount = results.filter(r => r.passed).length;
  console.log(`Test Summary: ${passedCount} / ${results.length} tests passed.`);
  if (passedCount === results.length) {
    console.log('ALL VERIFICATION CHECKS PASSED.');
  } else {
    console.error('SOME VERIFICATION CHECKS FAILED.');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner encountered an error:', err);
  process.exit(1);
});
