import React from 'react';
import { BRAND_ASSETS } from '../lib/branding.ts';

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center space-x-3">
              <img
                src={BRAND_ASSETS.fullNameLogoLandscape}
                alt="NexusMark"
                className="h-8 sm:h-9 w-auto max-w-[200px] object-contain rounded"
              />
            </div>
            <p className="text-sm text-gray-600 max-w-sm leading-relaxed">
              The AI-powered marketing platform for business owners. Scan any website, extract brand identity, uncover real SEO opportunities, and build a lasting marketing workspace.
            </p>
            <p className="text-xs text-gray-600">
              Visual identity rendered in #81171B burgundy and pure white. All website scans run through SSRF-protected server fetchers.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-black mb-3">Platform</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><a href="#features" className="hover:text-[#81171B]">Website Scanner</a></li>
              <li><a href="#brand-intelligence" className="hover:text-[#81171B]">Brand DNA Extraction</a></li>
              <li><a href="#how-it-works" className="hover:text-[#81171B]">SEO Audit Engine</a></li>
              <li><span className="text-gray-600">Marketing Workspaces</span></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-black mb-3">Architecture</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li><span>Zero AI Slop Rules</span></li>
              <li><span>Real Extracted CSS & Schema</span></li>
              <li><span>Strict Firestore ABAC Security</span></li>
              <li><span>Gemini Structured Output</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center text-xs text-gray-600 space-y-3 sm:space-y-0">
          <p>© {new Date().getFullYear()} NexusMark. Commercial Grade Marketing Platform.</p>
          <div className="flex space-x-6">
            <span className="hover:text-gray-700 cursor-pointer">Privacy Policy</span>
            <span className="hover:text-gray-700 cursor-pointer">Terms of Service</span>
            <span className="hover:text-gray-700 cursor-pointer">Security Safeguards</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
