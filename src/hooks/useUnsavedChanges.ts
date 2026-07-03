import { useEffect, useCallback, useState, useRef } from "react";

interface UseUnsavedChangesOptions {
  hasUnsavedChanges: boolean;
  enabled?: boolean;
}

interface UseUnsavedChangesReturn {
  showConfirmDialog: boolean;
  setShowConfirmDialog: (show: boolean) => void;
  handleClose: (onConfirm: () => void) => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  pendingAction: (() => void) | null;
}

export const useUnsavedChanges = ({
  hasUnsavedChanges,
  enabled = true,
}: UseUnsavedChangesOptions): UseUnsavedChangesReturn => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const isMounted = useRef(true);

  // Track mounted state to prevent state updates after unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Handle browser beforeunload event
  useEffect(() => {
    if (!enabled || !hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers require returnValue to be set
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, enabled]);

  const handleClose = useCallback((onConfirm: () => void) => {
    if (hasUnsavedChanges && enabled) {
      pendingActionRef.current = onConfirm;
      if (isMounted.current) {
        setShowConfirmDialog(true);
      }
    } else {
      onConfirm();
    }
  }, [hasUnsavedChanges, enabled]);

  const confirmDiscard = useCallback(() => {
    if (isMounted.current) {
      setShowConfirmDialog(false);
    }
    // Execute pending action after state update
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) {
      // Use setTimeout to ensure dialog closes first
      setTimeout(() => {
        action();
      }, 0);
    }
  }, []);

  const cancelDiscard = useCallback(() => {
    if (isMounted.current) {
      setShowConfirmDialog(false);
    }
    pendingActionRef.current = null;
  }, []);

  return {
    showConfirmDialog,
    setShowConfirmDialog,
    handleClose,
    confirmDiscard,
    cancelDiscard,
    pendingAction: pendingActionRef.current,
  };
};
