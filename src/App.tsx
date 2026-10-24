import { authenticatedFetch } from './lib/firebase.ts';
import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { Footer } from './components/Footer.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { ScanProgress, ScanStage } from './components/ScanProgress.tsx';
import { ScanResults, ScanResultData } from './components/ScanResults.tsx';
import { WorkspaceDashboard } from './components/WorkspaceDashboard.tsx';
import {
  WorkspaceRecord,
  createWorkspaceWithScanData,
  fetchUserWorkspaces,
} from './services/workspaceService.ts';
import { testConnection } from './lib/firebase.ts';

function AppContent() {
  const { user } = useAuth();
  const [view, setView] = useState<'landing' | 'scanning' | 'results' | 'dashboard'>('landing');

  // Scanner state
  const [targetUrl, setTargetUrl] = useState('');
  const [scanStage, setScanStage] = useState<ScanStage>('connecting');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanData, setScanData] = useState<ScanResultData | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Workspaces state
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  // Check connection on boot as mandated by skill
  useEffect(() => {
    testConnection();
  }, []);

  // Fetch workspaces when user changes
  useEffect(() => {
    let mounted = true;
    async function loadWorkspaces() {
      if (user) {
        try {
          const list = await fetchUserWorkspaces(user.uid);
          if (mounted) {
            setWorkspaces(list);
            if (list.length > 0 && !activeWorkspaceId) {
              setActiveWorkspaceId(list[0].id);
            }
          }
        } catch (err) {
          console.error('Failed to load user workspaces:', err);
        }
      } else {
        setWorkspaces([]);
        setActiveWorkspaceId(null);
      }
    }

    loadWorkspaces();
    return () => {
      mounted = false;
    };
  }, [user]);

  // Handle URL Scan Execution
  const handleStartScan = async (url: string) => {
    setTargetUrl(url);
    setView('scanning');
    setScanError(null);
    setIsScanning(true);
    setScanStage('connecting');

    // Progression timer to reflect backend steps accurately
    const timer1 = setTimeout(() => setScanStage('extracting'), 1200);
    const timer2 = setTimeout(() => setScanStage('analyzing'), 2800);
    const timer3 = setTimeout(() => setScanStage('checking_seo'), 4500);
    const timer4 = setTimeout(() => setScanStage('building_profile'), 6200);

    try {
      const response = await authenticatedFetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Failed to scan website. Please verify the URL and try again.');
      }

      const result: ScanResultData = await response.json();
      setScanData(result);
      setView('results');
    } catch (err: unknown) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      const msg = err instanceof Error ? err.message : 'An error occurred during scanning.';
      setScanError(msg);
    } finally {
      setIsScanning(false);
    }
  };

  // Handle Workspace Creation from Scan Results
  const handleCreateWorkspace = async (workspaceName: string) => {
    if (!scanData || !user) {
      throw new Error('User must be signed in to create a workspace.');
    }

    const { workspaceId } = await createWorkspaceWithScanData({
      userId: user.uid,
      workspaceName,
      sourceUrl: scanData.sourceUrl,
      scanData: {
        scanId: scanData.scanId,
        extracted: {
          url: scanData.sourceUrl,
          businessIdentity: scanData.businessIdentity,
          visualIdentity: scanData.visualIdentity,
          businessInfo: scanData.businessInfo,
          seo: scanData.seo,
          ecommerce: scanData.ecommerce,
          snapshot: scanData.snapshot || {
            screenshotUrl: null,
            screenshotStatus: 'unavailable',
            screenshotCapturedAt: new Date().toISOString(),
            previewImageUrl: null,
          },
        },
        aiAnalysis: scanData.aiAnalysis,
        scannedUrls: scanData.scannedUrls,
        pagesScanned: scanData.pagesScanned,
      },
    });

    // Refresh workspaces list and navigate to dashboard
    const updated = await fetchUserWorkspaces(user.uid);
    setWorkspaces(updated);
    setActiveWorkspaceId(workspaceId);
    setView('dashboard');
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-sans">
      <Navbar
        onNavigateHome={() => setView('landing')}
        onNavigateDashboard={() => setView('dashboard')}
        hasActiveWorkspace={workspaces.length > 0}
      />

      <div className="flex-1">
        {view === 'landing' && (
          <LandingPage onStartScan={handleStartScan} isScanning={isScanning} />
        )}

        {view === 'scanning' && (
          <ScanProgress
            currentStage={scanStage}
            targetUrl={targetUrl}
            error={scanError}
            onRetry={() => handleStartScan(targetUrl)}
            onCancel={() => setView('landing')}
          />
        )}

        {view === 'results' && scanData && (
          <ScanResults
            data={scanData}
            onCreateWorkspace={handleCreateWorkspace}
            onRescan={() => handleStartScan(scanData.sourceUrl)}
          />
        )}

        {view === 'dashboard' && activeWorkspaceId && (
          <WorkspaceDashboard
            currentWorkspaceId={activeWorkspaceId}
            allWorkspaces={workspaces}
            onSelectWorkspace={(id) => setActiveWorkspaceId(id)}
            onCreateNewWorkspace={() => {
              setScanData(null);
              setView('landing');
            }}
          />
        )}
      </div>

      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
