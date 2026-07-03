import { memo, useState, useEffect, ReactNode } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { FeatureUnavailableDialog } from "@/components/FeatureUnavailableDialog";
import { FeatureStatusBadge } from "@/components/FeatureStatusBadge";

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
  showDialog?: boolean;
  showBadge?: boolean;
}

export const FeatureGate = memo(({
  feature,
  children,
  fallback,
  showDialog = true,
  showBadge = false,
}: FeatureGateProps) => {
  const { isFeatureAccessible, getFeature, getFeatureStatus, getMaintenanceMessage, isLoading } = useFeatureFlags();
  const [dialogOpen, setDialogOpen] = useState(false);

  const isAccessible = isFeatureAccessible(feature);
  const featureData = getFeature(feature);
  const status = getFeatureStatus(feature);

  // Show dialog automatically when feature is not accessible and showDialog is true
  useEffect(() => {
    if (!isLoading && !isAccessible && showDialog && featureData) {
      setDialogOpen(true);
    }
  }, [isLoading, isAccessible, showDialog, featureData]);

  // Loading state
  if (isLoading) {
    return null;
  }

  // Feature not accessible - show fallback or dialog
  if (!isAccessible) {
    return (
      <>
        {fallback}
        {showDialog && featureData && status && (
          <FeatureUnavailableDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            featureName={featureData.feature_name}
            featureNameMy={featureData.feature_name_my}
            status={status}
            message={getMaintenanceMessage(feature)}
            messageMy={getMaintenanceMessage(feature, true)}
          />
        )}
      </>
    );
  }

  // Feature accessible - render children with optional badge
  if (showBadge && status && status !== "active") {
    return (
      <div className="relative">
        <div className="absolute -top-2 -right-2 z-10">
          <FeatureStatusBadge status={status} />
        </div>
        {children}
      </div>
    );
  }

  return <>{children}</>;
});

FeatureGate.displayName = "FeatureGate";

// Higher-order component version
export function withFeatureGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  featureKey: string,
  options?: Omit<FeatureGateProps, "feature" | "children">
) {
  return memo((props: P) => (
    <FeatureGate feature={featureKey} {...options}>
      <WrappedComponent {...props} />
    </FeatureGate>
  ));
}
