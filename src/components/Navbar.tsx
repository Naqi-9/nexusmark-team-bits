import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { Globe, LogIn, LogOut, Menu, X, LayoutDashboard, ChevronRight } from 'lucide-react';

import { BRAND_ASSETS } from '../lib/branding.ts';

interface NavbarProps {
  onNavigateHome: () => void;
  onNavigateDashboard?: () => void;
  hasActiveWorkspace?: boolean;
}

export function Navbar({ onNavigateHome, onNavigateDashboard, hasActiveWorkspace }: NavbarProps) {
  const { user, signInWithGoogle, signOut, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const handleSignIn = async () => {
    setAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      // Handled in context
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Product Name */}
          <button
            onClick={onNavigateHome}
            className="flex items-center space-x-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#81171B] rounded-lg py-1 px-1 transition-opacity hover:opacity-90"
            title="NexusMark Home"
          >
            <img
              src={BRAND_ASSETS.fullNameLogoLandscape}
              alt="NexusMark - AI Marketing Platform"
              className="h-9 sm:h-10 w-auto max-w-[190px] sm:max-w-[230px] object-contain rounded"
            />
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <a href="#how-it-works" className="text-sm font-medium text-gray-700 hover:text-[#81171B] transition-colors">
              How it works
            </a>
            <a href="#features" className="text-sm font-medium text-gray-700 hover:text-[#81171B] transition-colors">
              Features
            </a>
            <a href="#brand-intelligence" className="text-sm font-medium text-gray-700 hover:text-[#81171B] transition-colors">
              Brand Intelligence
            </a>
          </nav>

          {/* Auth & CTA Area */}
          <div className="hidden md:flex items-center space-x-3">
            {hasActiveWorkspace && onNavigateDashboard && (
              <button
                onClick={onNavigateDashboard}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-sm font-medium text-gray-800 hover:text-black hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-[#81171B]" />
                <span>My Workspace</span>
              </button>
            )}

            {user ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 pl-2">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-gray-200 object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#81171B] text-white flex items-center justify-center text-xs font-medium">
                      {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                    </div>
                  )}
                  <span className="text-sm text-gray-700 max-w-[120px] truncate font-medium">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                </div>
                <button
                  onClick={() => signOut()}
                  title="Sign out"
                  className="p-2 text-gray-500 hover:text-[#81171B] hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={authLoading || loading}
                className="inline-flex items-center space-x-2 px-4 py-2 text-sm font-semibold text-white bg-[#81171B] hover:bg-[#540804] active:bg-[#540804] rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{authLoading ? 'Signing in...' : 'Sign in'}</span>
              </button>
            )}
          </div>

          {/* Mobile menu trigger */}
          <div className="flex md:hidden items-center space-x-2">
            {hasActiveWorkspace && onNavigateDashboard && (
              <button
                onClick={onNavigateDashboard}
                className="p-2 text-gray-700 hover:text-[#81171B]"
                title="Go to Dashboard"
              >
                <LayoutDashboard className="w-5 h-5 text-[#81171B]" />
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-700 hover:text-[#81171B] focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-gray-200 bg-white px-4 pt-3 pb-6 space-y-4">
          <div className="flex flex-col space-y-2">
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 text-base font-medium text-gray-800 hover:text-[#81171B] hover:bg-gray-50 rounded-md"
            >
              How it works
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 text-base font-medium text-gray-800 hover:text-[#81171B] hover:bg-gray-50 rounded-md"
            >
              Features
            </a>
            <a
              href="#brand-intelligence"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 text-base font-medium text-gray-800 hover:text-[#81171B] hover:bg-gray-50 rounded-md"
            >
              Brand Intelligence
            </a>
          </div>

          <div className="pt-3 border-t border-gray-100">
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center space-x-3 px-3 py-2">
                  {user.photoURL && (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-gray-200" />
                  )}
                  <div className="text-sm">
                    <p className="font-medium text-black">{user.displayName || 'User'}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                </div>
                {hasActiveWorkspace && onNavigateDashboard && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateDashboard();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-white bg-[#81171B] rounded-lg"
                  >
                    <span>Open Marketing Workspace</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    signOut();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-red-700 border border-gray-200 rounded-lg"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  handleSignIn();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#81171B] hover:bg-[#540804] rounded-lg"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign in with Google</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
