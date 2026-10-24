import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, authenticatedFetch } from '../lib/firebase.ts';
import { AiBrandAnalysis } from '../server/geminiService.ts';
import { ExtractedWebsiteData } from '../server/extractor.ts';
import { WebsiteSnapshotResult } from '../server/screenshotService.ts';
import {
  ChatMessageRecord,
  persistChatMessage,
  normalizeStoredChatMessage,
} from '../lib/chatMessage.ts';

export type { ChatMessageRecord };

export interface WorkspaceRecord {
  id: string;
  ownerId: string;
  name: string;
  websiteUrl: string;
  status: 'active' | 'archived';
  latestScanId?: string;
  logoUrl?: string | null;
  websiteScreenshotUrl?: string | null;
  mobileScreenshotUrl?: string | null;
  ogImageUrl?: string | null;
  screenshotStatus?: 'captured' | 'preview_image' | 'unavailable';
  screenshotCapturedAt?: string;
  screenshotUrl?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface WebsiteScanRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  sourceUrl: string;
  status: 'queued' | 'crawling' | 'analyzing' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  pagesScanned: number;
  scannedUrls: string[];
  extractionResults: ExtractedWebsiteData;
  aiAnalysis: AiBrandAnalysis;
  createdAt?: any;
}

export interface BrandProfileRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  businessName: string;
  businessDescription: string;
  industry: string;
  industrySubcategory: string;
  businessType: string;

  // Multimodal Intelligence additions
  modelAttribution?: AiBrandAnalysis['modelAttribution'];
  visualIdentityDesignLanguage?: AiBrandAnalysis['visualIdentityDesignLanguage'];
  visualVsMessagingDiscrepancies?: AiBrandAnalysis['visualVsMessagingDiscrepancies'];
  top3PriorityActions?: AiBrandAnalysis['top3PriorityActions'];
  recommendedChannels?: AiBrandAnalysis['recommendedChannels'];

  brandVoice: AiBrandAnalysis['brandVoice'];
  targetAudienceHypotheses: AiBrandAnalysis['targetAudienceHypotheses'];
  valuePropositions: string[];
  mainProductsOrServices: string[];
  marketingStrengths?: string[];
  weaknessesAndMissedOpportunities?: string[];
  contentThemes: AiBrandAnalysis['contentThemes'];
  marketingOpportunities: AiBrandAnalysis['marketingOpportunities'];
  brandGuidelines: AiBrandAnalysis['brandGuidelines'];
  visualIdentity: ExtractedWebsiteData['visualIdentity'];
  socialLinks: ExtractedWebsiteData['businessInfo']['socialLinks'];
  logoUrl?: string | null;
  logoSource?: string;
  logoStatus?: 'verified' | 'unverified' | 'fallback';
  logoCandidates?: any[];
  logoLastCheckedAt?: string;
  websiteScreenshotUrl?: string | null;
  mobileScreenshotUrl?: string | null;
  ogImageUrl?: string | null;
  screenshotUrl?: string | null;
  screenshotStatus?: 'captured' | 'preview_image' | 'unavailable';
  screenshotCapturedAt?: string;
  previewImageUrl?: string | null;
  updatedAt?: any;
}

export interface SeoAuditRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  affectedUrl: string;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  h1Count: number;
  missingAltPercentage: number;
  hasMobileViewport: boolean;
  issues: ExtractedWebsiteData['seo']['issues'];
  recommendations: AiBrandAnalysis['seoRecommendations'];
  auditedAt: string;
}

export interface ProductRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  name: string;
  description: string;
  price?: string;
  currency?: string;
  imageUrl?: string;
  productUrl?: string;
  category?: string;
  availability?: string;
  detectedAt: string;
}

export interface DeliverableRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  type: 'content_calendar' | 'brand_strategy' | 'ad_campaign' | 'seo_plan';
  title: string;
  content: any;
  status: 'draft' | 'scheduled' | 'published' | 'approved';
  modelUsed?: string;
  generationWarning?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates a complete persistent marketing workspace in Firestore
 */
export async function createWorkspaceWithScanData(params: {
  userId: string;
  workspaceName: string;
  sourceUrl: string;
  scanData: {
    scanId: string;
    extracted: ExtractedWebsiteData;
    aiAnalysis: AiBrandAnalysis;
    scannedUrls: string[];
    pagesScanned: number;
  };
}): Promise<{ workspaceId: string }> {
  const { userId, workspaceName, sourceUrl, scanData } = params;
  const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const scanId = scanData.scanId || `scan_${Date.now()}`;
  const profileId = `prof_${workspaceId}`;
  const auditId = `seo_${workspaceId}`;

  // 1. Create Workspace Document
  const workspacePath = `workspaces/${workspaceId}`;
  try {
    await setDoc(doc(db, 'workspaces', workspaceId), {
      id: workspaceId,
      ownerId: userId,
      name: workspaceName.trim(),
      websiteUrl: sourceUrl,
      status: 'active',
      latestScanId: scanId,
      logoUrl: scanData.extracted.businessIdentity.logoUrl || null,
      websiteScreenshotUrl: scanData.extracted.snapshot?.websiteScreenshotUrl || null,
      mobileScreenshotUrl: scanData.extracted.snapshot?.mobileScreenshotUrl || null,
      ogImageUrl: scanData.extracted.snapshot?.ogImageUrl || null,
      screenshotStatus: scanData.extracted.snapshot?.screenshotStatus || 'unavailable',
      screenshotCapturedAt: scanData.extracted.snapshot?.screenshotCapturedAt || new Date().toISOString(),
      screenshotUrl: scanData.extracted.snapshot?.websiteScreenshotUrl || scanData.extracted.snapshot?.screenshotUrl || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, workspacePath);
  }

  // 2. Save Historical Scan Record
  const scanPath = `websiteScans/${scanId}`;
  try {
    await setDoc(doc(db, 'websiteScans', scanId), {
      id: scanId,
      ownerId: userId,
      workspaceId,
      sourceUrl,
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      pagesScanned: scanData.pagesScanned || 1,
      scannedUrls: scanData.scannedUrls || [sourceUrl],
      extractionResults: scanData.extracted,
      aiAnalysis: scanData.aiAnalysis,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, scanPath);
  }

  // 3. Save Brand Profile with Multimodal Intelligence
  const profilePath = `brandProfiles/${profileId}`;
  try {
    await setDoc(doc(db, 'brandProfiles', profileId), {
      id: profileId,
      ownerId: userId,
      workspaceId,
      businessName: scanData.aiAnalysis.businessName || scanData.extracted.businessIdentity.name || 'Business',
      businessDescription: scanData.aiAnalysis.businessDescription || scanData.extracted.businessIdentity.description || '',
      industry: scanData.aiAnalysis.industry || 'Technology & Services',
      industrySubcategory: scanData.aiAnalysis.industrySubcategory || '',
      businessType: scanData.aiAnalysis.businessType || 'General',
      modelAttribution: scanData.aiAnalysis.modelAttribution || null,
      visualIdentityDesignLanguage: scanData.aiAnalysis.visualIdentityDesignLanguage || null,
      visualVsMessagingDiscrepancies: scanData.aiAnalysis.visualVsMessagingDiscrepancies || null,
      top3PriorityActions: scanData.aiAnalysis.top3PriorityActions || [],
      recommendedChannels: scanData.aiAnalysis.recommendedChannels || [],
      brandVoice: scanData.aiAnalysis.brandVoice,
      targetAudienceHypotheses: scanData.aiAnalysis.targetAudienceHypotheses,
      valuePropositions: scanData.aiAnalysis.valuePropositions,
      mainProductsOrServices: scanData.aiAnalysis.mainProductsOrServices,
      marketingStrengths: scanData.aiAnalysis.marketingStrengths || [],
      weaknessesAndMissedOpportunities: scanData.aiAnalysis.weaknessesAndMissedOpportunities || [],
      contentThemes: scanData.aiAnalysis.contentThemes,
      marketingOpportunities: scanData.aiAnalysis.marketingOpportunities,
      brandGuidelines: scanData.aiAnalysis.brandGuidelines,
      visualIdentity: scanData.extracted.visualIdentity,
      socialLinks: scanData.extracted.businessInfo.socialLinks,
      logoUrl: scanData.extracted.businessIdentity.logoUrl || null,
      logoSource: scanData.extracted.businessIdentity.logoSource || 'No Logo Detected',
      logoStatus: scanData.extracted.businessIdentity.logoStatus || 'fallback',
      logoCandidates: scanData.extracted.businessIdentity.logoCandidates || [],
      logoLastCheckedAt: scanData.extracted.businessIdentity.logoLastCheckedAt || new Date().toISOString(),
      websiteScreenshotUrl: scanData.extracted.snapshot?.websiteScreenshotUrl || null,
      mobileScreenshotUrl: scanData.extracted.snapshot?.mobileScreenshotUrl || null,
      ogImageUrl: scanData.extracted.snapshot?.ogImageUrl || null,
      screenshotUrl: scanData.extracted.snapshot?.websiteScreenshotUrl || scanData.extracted.snapshot?.screenshotUrl || null,
      screenshotStatus: scanData.extracted.snapshot?.screenshotStatus || 'unavailable',
      screenshotCapturedAt: scanData.extracted.snapshot?.screenshotCapturedAt || new Date().toISOString(),
      previewImageUrl: scanData.extracted.snapshot?.previewImageUrl || null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, profilePath);
  }

  // 4. Save SEO Audit
  const auditPath = `seoAudits/${auditId}`;
  try {
    await setDoc(doc(db, 'seoAudits', auditId), {
      id: auditId,
      ownerId: userId,
      workspaceId,
      affectedUrl: sourceUrl,
      title: scanData.extracted.seo.title,
      metaDescription: scanData.extracted.seo.metaDescription,
      canonicalUrl: scanData.extracted.seo.canonicalUrl,
      h1Count: scanData.extracted.seo.h1Count,
      missingAltPercentage: scanData.extracted.seo.missingAltPercentage,
      hasMobileViewport: scanData.extracted.seo.hasMobileViewport,
      issues: scanData.extracted.seo.issues,
      recommendations: scanData.aiAnalysis.seoRecommendations,
      auditedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, auditPath);
  }

  // 5. Save Detected Products if any
  if (scanData.extracted.ecommerce.products?.length > 0) {
    for (let i = 0; i < scanData.extracted.ecommerce.products.length; i++) {
      const prod = scanData.extracted.ecommerce.products[i];
      const prodId = `prod_${workspaceId}_${i}`;
      try {
        await setDoc(doc(db, 'products', prodId), {
          id: prodId,
          ownerId: userId,
          workspaceId,
          name: prod.name,
          description: prod.description || '',
          price: prod.price || '',
          currency: prod.currency || '',
          imageUrl: prod.imageUrl || '',
          productUrl: prod.productUrl || '',
          category: prod.category || '',
          availability: prod.availability || 'InStock',
          detectedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Non-fatal error creating product record:', err);
      }
    }
  }

  // 6. Record Activity Log
  const logId = `log_${Date.now()}`;
  try {
    await setDoc(doc(db, 'activityLogs', logId), {
      id: logId,
      ownerId: userId,
      workspaceId,
      action: 'Workspace Created',
      details: `Created workspace "${workspaceName}" with Gemma 4 Brand Intelligence for ${sourceUrl}`,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Non-fatal error creating log record:', err);
  }

  return { workspaceId };
}

/**
 * Loads all workspaces belonging to an authenticated user
 */
export async function fetchUserWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
  const collectionPath = 'workspaces';
  try {
    const q = query(collection(db, collectionPath), where('ownerId', '==', userId));
    const snapshot = await getDocs(q);
    const workspaces: WorkspaceRecord[] = [];
    snapshot.forEach(docSnap => {
      workspaces.push(docSnap.data() as WorkspaceRecord);
    });
    return workspaces;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, collectionPath);
  }
}

/**
 * Loads full workspace bundle: workspace, brand profile, SEO audit, products, deliverables, and latest scan
 */
export async function loadWorkspaceDetails(workspaceId: string) {
  const wsPath = `workspaces/${workspaceId}`;
  let workspace: WorkspaceRecord | null = null;
  try {
    const snap = await getDoc(doc(db, 'workspaces', workspaceId));
    if (snap.exists()) {
      workspace = snap.data() as WorkspaceRecord;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, wsPath);
  }

  if (!workspace) return null;

  // Load Brand Profile
  let brandProfile: BrandProfileRecord | null = null;
  try {
    const snap = await getDoc(doc(db, 'brandProfiles', `prof_${workspaceId}`));
    if (snap.exists()) {
      brandProfile = snap.data() as BrandProfileRecord;
    }
  } catch (err) {
    console.warn('Brand profile not found:', err);
  }

  // Load SEO Audit
  let seoAudit: SeoAuditRecord | null = null;
  try {
    const snap = await getDoc(doc(db, 'seoAudits', `seo_${workspaceId}`));
    if (snap.exists()) {
      seoAudit = snap.data() as SeoAuditRecord;
    }
  } catch (err) {
    console.warn('SEO audit not found:', err);
  }

  // Load Products
  const products: ProductRecord[] = [];
  try {
    const q = query(collection(db, 'products'), where('workspaceId', '==', workspaceId), where('ownerId', '==', auth.currentUser?.uid || ''));
    const snap = await getDocs(q);
    snap.forEach(docSnap => products.push(docSnap.data() as ProductRecord));
  } catch (err) {
    console.warn('Products query warning:', err);
  }

  // Load Scan History
  const scans: WebsiteScanRecord[] = [];
  try {
    const q = query(collection(db, 'websiteScans'), where('workspaceId', '==', workspaceId), where('ownerId', '==', auth.currentUser?.uid || ''));
    const snap = await getDocs(q);
    snap.forEach(docSnap => scans.push(docSnap.data() as WebsiteScanRecord));
  } catch (err) {
    console.warn('Scan history query warning:', err);
  }

  // Load Deliverables
  const deliverables: DeliverableRecord[] = [];
  try {
    const q = query(collection(db, 'deliverables'), where('workspaceId', '==', workspaceId), where('ownerId', '==', auth.currentUser?.uid || ''));
    const snap = await getDocs(q);
    snap.forEach(docSnap => deliverables.push(docSnap.data() as DeliverableRecord));
  } catch (err) {
    console.warn('Deliverables query warning:', err);
  }

  return {
    workspace,
    brandProfile,
    seoAudit,
    products,
    scans,
    deliverables,
  };
}

/**
 * Updates a workspace's name
 */
export async function updateWorkspaceName(workspaceId: string, newName: string) {
  const path = `workspaces/${workspaceId}`;
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId), {
      name: newName.trim(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Saves a completed rescan to workspace history and updates current brand profile & SEO
 */
export async function applyRescanToWorkspace(params: {
  userId: string;
  workspaceId: string;
  sourceUrl: string;
  scanData: {
    scanId: string;
    extracted: ExtractedWebsiteData;
    aiAnalysis: AiBrandAnalysis;
    scannedUrls: string[];
    pagesScanned: number;
  };
}) {
  const { userId, workspaceId, sourceUrl, scanData } = params;
  const newScanId = scanData.scanId || `scan_${Date.now()}`;

  // 1. Save new scan in history
  await setDoc(doc(db, 'websiteScans', newScanId), {
    id: newScanId,
    ownerId: userId,
    workspaceId,
    sourceUrl,
    status: 'completed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    pagesScanned: scanData.pagesScanned || 1,
    scannedUrls: scanData.scannedUrls || [sourceUrl],
    extractionResults: scanData.extracted,
    aiAnalysis: scanData.aiAnalysis,
    createdAt: serverTimestamp(),
  });

  // 2. Update brand profile
  await setDoc(doc(db, 'brandProfiles', `prof_${workspaceId}`), {
    id: `prof_${workspaceId}`,
    ownerId: userId,
    workspaceId,
    businessName: scanData.aiAnalysis.businessName || scanData.extracted.businessIdentity.name || 'Business',
    businessDescription: scanData.aiAnalysis.businessDescription || scanData.extracted.businessIdentity.description || '',
    industry: scanData.aiAnalysis.industry || 'Technology & Services',
    industrySubcategory: scanData.aiAnalysis.industrySubcategory || '',
    businessType: scanData.aiAnalysis.businessType || 'General',
    modelAttribution: scanData.aiAnalysis.modelAttribution || null,
    visualIdentityDesignLanguage: scanData.aiAnalysis.visualIdentityDesignLanguage || null,
    visualVsMessagingDiscrepancies: scanData.aiAnalysis.visualVsMessagingDiscrepancies || null,
    top3PriorityActions: scanData.aiAnalysis.top3PriorityActions || [],
    recommendedChannels: scanData.aiAnalysis.recommendedChannels || [],
    brandVoice: scanData.aiAnalysis.brandVoice,
    targetAudienceHypotheses: scanData.aiAnalysis.targetAudienceHypotheses,
    valuePropositions: scanData.aiAnalysis.valuePropositions,
    mainProductsOrServices: scanData.aiAnalysis.mainProductsOrServices,
    marketingStrengths: scanData.aiAnalysis.marketingStrengths || [],
    weaknessesAndMissedOpportunities: scanData.aiAnalysis.weaknessesAndMissedOpportunities || [],
    contentThemes: scanData.aiAnalysis.contentThemes,
    marketingOpportunities: scanData.aiAnalysis.marketingOpportunities,
    brandGuidelines: scanData.aiAnalysis.brandGuidelines,
    visualIdentity: scanData.extracted.visualIdentity,
    socialLinks: scanData.extracted.businessInfo.socialLinks,
    logoUrl: scanData.extracted.businessIdentity.logoUrl || null,
    logoSource: scanData.extracted.businessIdentity.logoSource || 'No Logo Detected',
    logoStatus: scanData.extracted.businessIdentity.logoStatus || 'fallback',
    logoCandidates: scanData.extracted.businessIdentity.logoCandidates || [],
    logoLastCheckedAt: scanData.extracted.businessIdentity.logoLastCheckedAt || new Date().toISOString(),
    websiteScreenshotUrl: scanData.extracted.snapshot?.websiteScreenshotUrl || null,
    mobileScreenshotUrl: scanData.extracted.snapshot?.mobileScreenshotUrl || null,
    ogImageUrl: scanData.extracted.snapshot?.ogImageUrl || null,
    screenshotUrl: scanData.extracted.snapshot?.websiteScreenshotUrl || scanData.extracted.snapshot?.screenshotUrl || null,
    screenshotStatus: scanData.extracted.snapshot?.screenshotStatus || 'unavailable',
    screenshotCapturedAt: scanData.extracted.snapshot?.screenshotCapturedAt || new Date().toISOString(),
    previewImageUrl: scanData.extracted.snapshot?.previewImageUrl || null,
    updatedAt: serverTimestamp(),
  });

  // 3. Update SEO audit
  await setDoc(doc(db, 'seoAudits', `seo_${workspaceId}`), {
    id: `seo_${workspaceId}`,
    ownerId: userId,
    workspaceId,
    affectedUrl: sourceUrl,
    title: scanData.extracted.seo.title,
    metaDescription: scanData.extracted.seo.metaDescription,
    canonicalUrl: scanData.extracted.seo.canonicalUrl,
    h1Count: scanData.extracted.seo.h1Count,
    missingAltPercentage: scanData.extracted.seo.missingAltPercentage,
    hasMobileViewport: scanData.extracted.seo.hasMobileViewport,
    issues: scanData.extracted.seo.issues,
    recommendations: scanData.aiAnalysis.seoRecommendations,
    auditedAt: new Date().toISOString(),
  });

  // 4. Update workspace's latest scan reference and imagery
  await updateDoc(doc(db, 'workspaces', workspaceId), {
    latestScanId: newScanId,
    logoUrl: scanData.extracted.businessIdentity.logoUrl || null,
    websiteScreenshotUrl: scanData.extracted.snapshot?.websiteScreenshotUrl || null,
    mobileScreenshotUrl: scanData.extracted.snapshot?.mobileScreenshotUrl || null,
    ogImageUrl: scanData.extracted.snapshot?.ogImageUrl || null,
    screenshotStatus: scanData.extracted.snapshot?.screenshotStatus || 'unavailable',
    screenshotCapturedAt: scanData.extracted.snapshot?.screenshotCapturedAt || new Date().toISOString(),
    screenshotUrl: scanData.extracted.snapshot?.websiteScreenshotUrl || scanData.extracted.snapshot?.screenshotUrl || null,
    updatedAt: serverTimestamp(),
  });

  // 5. Activity log
  const logId = `log_${Date.now()}`;
  await setDoc(doc(db, 'activityLogs', logId), {
    id: logId,
    ownerId: userId,
    workspaceId,
    action: 'Website Rescanned',
    details: `Updated brand DNA and SEO audit from fresh scan with Gemma 4 (${scanData.pagesScanned} pages analyzed)`,
    timestamp: serverTimestamp(),
  });
}

// -------------------------------------------------------------
// Deliverables Operations
// -------------------------------------------------------------
export async function saveDeliverable(params: {
  userId: string;
  workspaceId: string;
  type: 'content_calendar' | 'brand_strategy' | 'ad_campaign' | 'seo_plan';
  title: string;
  content: any;
  modelUsed?: string;
  generationWarning?: string;
}): Promise<DeliverableRecord> {
  const deliverableId = `deliv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const record: DeliverableRecord = {
    id: deliverableId,
    ownerId: params.userId,
    workspaceId: params.workspaceId,
    type: params.type,
    title: params.title,
    content: params.content,
    status: 'draft',
    ...(params.modelUsed ? { modelUsed: params.modelUsed } : {}),
    ...(params.generationWarning ? { generationWarning: params.generationWarning } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'deliverables', deliverableId), record);
  return record;
}

export async function fetchDeliverables(workspaceId: string): Promise<DeliverableRecord[]> {
  try {
    const q = query(collection(db, 'deliverables'), where('workspaceId', '==', workspaceId), where('ownerId', '==', auth.currentUser?.uid || ''));
    const snapshot = await getDocs(q);
    const list: DeliverableRecord[] = [];
    snapshot.forEach(docSnap => list.push(docSnap.data() as DeliverableRecord));
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.error('Failed to fetch deliverables:', err);
    return [];
  }
}

export async function updateDeliverable(
  deliverableId: string,
  updates: Partial<DeliverableRecord>
) {
  await updateDoc(doc(db, 'deliverables', deliverableId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteDeliverable(deliverableId: string) {
  await deleteDoc(doc(db, 'deliverables', deliverableId));
}

// -------------------------------------------------------------
// Interactive Chat Operations
// -------------------------------------------------------------
export async function saveChatMessage(params: {
  /** Pass the same id when retrying so the write is idempotent (no duplicates). */
  id?: string;
  userId: string;
  workspaceId: string;
  role: 'user' | 'assistant';
  content: string;
  /** Only pass the model that actually produced the message; omit otherwise. */
  modelUsed?: string;
  suggestedActions?: string[];
  createdAt?: string;
}): Promise<ChatMessageRecord> {
  return persistChatMessage(
    (col, id, data) => setDoc(doc(db, col, id), data),
    params
  );
}

export async function fetchChatMessages(workspaceId: string): Promise<ChatMessageRecord[]> {
  try {
    const q = query(collection(db, 'chatMessages'), where('workspaceId', '==', workspaceId), where('ownerId', '==', auth.currentUser?.uid || ''));
    const snapshot = await getDocs(q);
    const list: ChatMessageRecord[] = [];
    snapshot.forEach(docSnap => {
      // Tolerates legacy docs with missing/invalid optional fields.
      const msg = normalizeStoredChatMessage(docSnap.data());
      if (msg) list.push(msg);
    });
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch (err) {
    console.error('Failed to fetch chat messages:', err);
    return [];
  }
}

/**
 * Regenerates or captures a real screenshot for an existing workspace without overwriting
 * Brand DNA, SEO audits, or marketing deliverables.
 */
export async function regenerateWorkspaceScreenshot(params: {
  workspaceId: string;
  websiteUrl: string;
}): Promise<WebsiteSnapshotResult> {
  const { workspaceId, websiteUrl } = params;

  const res = await authenticatedFetch('/api/capture-screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: websiteUrl, forceFresh: true, workspaceId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to capture live website screenshot.');
  }

  const snapshot: WebsiteSnapshotResult = await res.json();

  if (snapshot.screenshotStatus === 'captured' && snapshot.websiteScreenshotUrl) {
    const updates = {
      websiteScreenshotUrl: snapshot.websiteScreenshotUrl,
      mobileScreenshotUrl: snapshot.mobileScreenshotUrl || null,
      ogImageUrl: snapshot.ogImageUrl || null,
      screenshotUrl: snapshot.websiteScreenshotUrl,
      screenshotStatus: 'captured',
      screenshotCapturedAt: snapshot.screenshotCapturedAt || new Date().toISOString(),
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'workspaces', workspaceId), updates);
      await updateDoc(doc(db, 'brandProfiles', `prof_${workspaceId}`), updates);
    } catch (e) {
      console.warn('[WorkspaceService] Non-fatal error updating screenshot in Firestore:', e);
    }
  }

  return snapshot;
}

