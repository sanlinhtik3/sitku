import { memo, useState, useEffect, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { FeatureUnavailableDialog } from "@/components/FeatureUnavailableDialog";

interface FeatureGateRouteProps {
  feature: string;
  children: ReactNode;
  redirectTo?: string;
}

/**
 * A route-level feature gate that shows a dialog and redirects when feature is disabled
 */
export const FeatureGateRoute = memo(({
  feature,
  children,
  redirectTo = "/dashboard",
}: FeatureGateRouteProps) => {
  const navigate = useNavigate();
  const { isFeatureAccessible, getFeature, getFeatureStatus, getMaintenanceMessage, isLoading } = useFeatureFlags();
  const [dialogOpen, setDialogOpen] = useState(false);

  const isAccessible = isFeatureAccessible(feature);
  const featureData = getFeature(feature);
  const status = getFeatureStatus(feature);

  useEffect(() => {
    if (!isLoading && !isAccessible && featureData) {
      setDialogOpen(true);
    }
  }, [isLoading, isAccessible, featureData]);

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      navigate(redirectTo, { replace: true });
    }
  };

  // Loading state - return null, let parent Suspense handle it
  if (isLoading) {
    return null;
  }

  // Feature not accessible - show dialog and redirect on close
  if (!isAccessible && featureData && status) {
    return (
      <FeatureUnavailableDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        featureName={featureData.feature_name}
        featureNameMy={featureData.feature_name_my}
        status={status}
        message={getMaintenanceMessage(feature)}
        messageMy={getMaintenanceMessage(feature, true)}
      />
    );
  }

  // Feature accessible - render children
  return <>{children}</>;
});

FeatureGateRoute.displayName = "FeatureGateRoute";
