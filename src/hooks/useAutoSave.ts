import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface DraftData {
  id?: string;
  title: string;
  topic: string;
  content: string;
  tags: string;
  isTemplate: boolean;
  lastSaved: string;
  originalContentHash: string;
  expiresAt: string;
  sessionId: string;
}

interface UseAutoSaveOptions {
  contentId?: string;
  data: Omit<DraftData, 'lastSaved' | 'originalContentHash' | 'id' | 'expiresAt' | 'sessionId'>;
  debounceMs?: number;
  enabled?: boolean;
  expiryDays?: number;
}

interface UseAutoSaveReturn {
  isSaving: boolean;
  lastSaved: Date | null;
  hasDraft: boolean;
  loadDraft: () => DraftData | null;
  clearDraft: () => void;
  hasUnsavedChanges: boolean;
  draftData: DraftData | null;
  isReady: boolean;
  error: string | null;
}

const DRAFT_PREFIX = "draft-content-";
const MAX_DRAFT_SIZE_KB = 500; // 500KB limit per draft

// Generate stable session ID for new content
const generateSessionId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Simple hash function to detect changes
const hashContent = (data: Omit<DraftData, 'lastSaved' | 'originalContentHash' | 'id' | 'expiresAt' | 'sessionId'>): string => {
  const str = JSON.stringify({
    title: data.title,
    topic: data.topic,
    content: data.content,
    tags: data.tags,
    isTemplate: data.isTemplate,
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
};

// Safe localStorage operations
const safeLocalStorageGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn("localStorage read failed:", e);
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string): boolean => {
  try {
    // Check size before saving
    const sizeKB = new Blob([value]).size / 1024;
    if (sizeKB > MAX_DRAFT_SIZE_KB) {
      console.warn(`Draft size (${sizeKB.toFixed(1)}KB) exceeds limit (${MAX_DRAFT_SIZE_KB}KB)`);
      return false;
    }
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn("localStorage quota exceeded");
      // Try to clean up old drafts
      cleanupExpiredDrafts();
    }
    return false;
  }
};

const safeLocalStorageRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn("localStorage remove failed:", e);
  }
};

// Cleanup expired drafts
const cleanupExpiredDrafts = (): void => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const draft = JSON.parse(value) as DraftData;
            if (draft.expiresAt && new Date(draft.expiresAt) < new Date()) {
              keysToRemove.push(key);
            }
          } catch {
            // Invalid draft, remove it
            keysToRemove.push(key);
          }
        }
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn("Draft cleanup failed:", e);
  }
};

export const useAutoSave = ({
  contentId,
  data,
  debounceMs = 3000,
  enabled = true,
  expiryDays = 7,
}: UseAutoSaveOptions): UseAutoSaveReturn => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use refs to avoid stale closure issues
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);
  const originalHashRef = useRef<string>("");
  const sessionIdRef = useRef<string>("");
  const dataRef = useRef(data);
  const lastSavedHashRef = useRef<string>("");
  
  // Update data ref when data changes
  dataRef.current = data;

  // Generate stable draft key
  const getDraftKey = useCallback(() => {
    if (contentId) {
      return `${DRAFT_PREFIX}${contentId}`;
    }
    // For new content, use session-based key
    if (!sessionIdRef.current) {
      sessionIdRef.current = generateSessionId();
    }
    return `${DRAFT_PREFIX}new-${sessionIdRef.current}`;
  }, [contentId]);

  // Memoize current hash to avoid recalculation
  const currentHash = useMemo(() => hashContent(data), [data]);

  // Initialize on mount - runs once
  useEffect(() => {
    if (!enabled) {
      setIsReady(true);
      return;
    }

    isMounted.current = true;
    
    // Cleanup expired drafts on init
    cleanupExpiredDrafts();
    
    // Set original hash synchronously
    originalHashRef.current = hashContent(dataRef.current);
    lastSavedHashRef.current = originalHashRef.current;
    
    // Check for existing draft
    const key = getDraftKey();
    const savedDraft = safeLocalStorageGet(key);
    
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft) as DraftData;
        
        // Check if draft is expired
        if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
          safeLocalStorageRemove(key);
        } else {
          setDraftData(parsed);
          setHasDraft(true);
          setLastSaved(new Date(parsed.lastSaved));
        }
      } catch (e) {
        console.error("Failed to parse draft:", e);
        safeLocalStorageRemove(key);
      }
    }
    
    setIsReady(true);

    return () => {
      isMounted.current = false;
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [enabled, getDraftKey]);

  // Reset when contentId changes
  useEffect(() => {
    if (!enabled || !isReady) return;
    
    // Reset original hash when switching content
    originalHashRef.current = hashContent(dataRef.current);
    lastSavedHashRef.current = originalHashRef.current;
    sessionIdRef.current = "";
    
    // Clear previous draft state when switching
    setDraftData(null);
    setHasDraft(false);
    setLastSaved(null);
    setError(null);
    
    // Check for draft of new content
    const key = getDraftKey();
    const savedDraft = safeLocalStorageGet(key);
    
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft) as DraftData;
        if (!parsed.expiresAt || new Date(parsed.expiresAt) >= new Date()) {
          setDraftData(parsed);
          setHasDraft(true);
          setLastSaved(new Date(parsed.lastSaved));
        }
      } catch (e) {
        safeLocalStorageRemove(key);
      }
    }
  }, [contentId, enabled, isReady, getDraftKey]);

  // Auto-save with debounce
  useEffect(() => {
    if (!enabled || !isReady) return;
    
    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    // Only save if content has actually changed from last saved state
    if (currentHash === lastSavedHashRef.current) {
      return;
    }

    debounceTimer.current = setTimeout(() => {
      if (!isMounted.current) return;
      
      setIsSaving(true);
      setError(null);
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);
      
      const draftToSave: DraftData = {
        id: contentId,
        ...dataRef.current,
        lastSaved: new Date().toISOString(),
        originalContentHash: originalHashRef.current,
        expiresAt: expiresAt.toISOString(),
        sessionId: sessionIdRef.current,
      };

      const success = safeLocalStorageSet(getDraftKey(), JSON.stringify(draftToSave));
      
      if (isMounted.current) {
        if (success) {
          setLastSaved(new Date());
          setHasDraft(true);
          setDraftData(draftToSave);
          lastSavedHashRef.current = currentHash;
        } else {
          setError("Failed to save draft. Content may be too large.");
        }
        setIsSaving(false);
      }
    }, debounceMs);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [currentHash, debounceMs, getDraftKey, enabled, isReady, contentId, expiryDays]);

  const loadDraft = useCallback((): DraftData | null => {
    const key = getDraftKey();
    const savedDraft = safeLocalStorageGet(key);
    
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft) as DraftData;
        // Check expiry
        if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
          safeLocalStorageRemove(key);
          return null;
        }
        return parsed;
      } catch (e) {
        console.error("Failed to parse draft:", e);
        return null;
      }
    }
    return null;
  }, [getDraftKey]);

  const clearDraft = useCallback(() => {
    const key = getDraftKey();
    safeLocalStorageRemove(key);
    setHasDraft(false);
    setDraftData(null);
    setLastSaved(null);
    setError(null);
    // Update last saved hash to current to prevent immediate re-save
    lastSavedHashRef.current = hashContent(dataRef.current);
  }, [getDraftKey]);

  // Calculate hasUnsavedChanges only after ready
  const hasUnsavedChanges = isReady && currentHash !== originalHashRef.current;

  return {
    isSaving,
    lastSaved,
    hasDraft,
    loadDraft,
    clearDraft,
    hasUnsavedChanges,
    draftData,
    isReady,
    error,
  };
};
