import React, { useState } from 'react';

interface BrandLogoProps {
  logoUrl?: string | null;
  businessName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showFallbackBadge?: boolean;
}

const SIZE_CLASSES = {
  xs: 'w-6 h-6 text-[10px] rounded',
  sm: 'w-8 h-8 text-xs rounded-lg',
  md: 'w-10 h-10 text-sm rounded-xl',
  lg: 'w-14 h-14 text-base rounded-2xl',
  xl: 'w-20 h-20 text-xl rounded-2xl',
};

export function BrandLogo({
  logoUrl,
  businessName = 'Business',
  size = 'md',
  className = '',
  showFallbackBadge = false,
}: BrandLogoProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(logoUrl));

  const sizeClass = SIZE_CLASSES[size];

  // Derive 1-2 initials for fallback
  const words = businessName.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase()
    : (businessName.slice(0, 2) || 'NM').toUpperCase();

  const isUsableImage = Boolean(logoUrl && !loadFailed && !logoUrl.startsWith('data:,'));

  if (!isUsableImage) {
    return (
      <div className="relative inline-flex items-center">
        <div
          className={`${sizeClass} bg-gray-100 border border-gray-200 text-gray-800 font-bold flex items-center justify-center tracking-wider shadow-xs select-none ${className}`}
          title={`${businessName} (Initial mark)`}
          role="img"
          aria-label={`${businessName} initial mark`}
        >
          {initials}
        </div>
        {showFallbackBadge && (
          <span className="sr-only">Fallback logo placeholder</span>
        )}
      </div>
    );
  }

  return (
    <div className={`relative inline-flex items-center justify-center ${sizeClass} bg-white border border-gray-200 overflow-hidden shadow-xs ${className}`}>
      {loading && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
          <span className="text-[10px] text-gray-400 font-mono">...</span>
        </div>
      )}
      <img
        src={logoUrl!}
        alt={`${businessName} logo`}
        className={`w-full h-full object-contain p-1 transition-opacity duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setLoadFailed(true);
        }}
      />
    </div>
  );
}
