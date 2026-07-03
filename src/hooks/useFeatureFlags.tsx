import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useCallback, useMemo } from "react";

export type FeatureStatus = "active" | "beta" | "maintenance" | "coming_soon" | "deprecated";

export interface FeatureFlag {
  id: string;
  feature_key: string;
  parent_feature_key: string | null;
  feature_name: string;
  feature_name_my: string | null;
  description: string | null;
  description_my: string | null;
  icon: string;
  status: FeatureStatus;
  is_enabled: boolean;
  status_message: string | null;
  status_message_my: string | null;
  maintenance_message: string | null;
  maintenance_message_my: string | null;
  category: string;
  sort_order: number;
  show_in_nav: boolean;
  show_on_dashboard: boolean;
  updated_at: string;
}

export function useFeatureFlags() {
  const queryClient = useQueryClient();

  const { data: flags = [], isLoading, error } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data as FeatureFlag[];
    },
    staleTime: 1000 * 60 * 30, // 30 minutes - feature flags rarely change
  });


  // Check if a feature is enabled (considers parent status too)
  const isFeatureEnabled = useCallback(
    (featureKey: string): boolean => {
      const feature = flags.find((f) => f.feature_key === featureKey);
      if (!feature) return true; // Default to enabled if not found

      // Check if feature itself is enabled and active
      if (!feature.is_enabled || feature.status === "maintenance" || feature.status === "coming_soon") {
        return false;
      }

      // Check parent feature if exists
      if (feature.parent_feature_key) {
        const parent = flags.find((f) => f.feature_key === feature.parent_feature_key);
        if (parent && (!parent.is_enabled || parent.status === "maintenance" || parent.status === "coming_soon")) {
          return false;
        }
      }

      return true;
    },
    [flags]
  );

  // Check if a feature is accessible (can be viewed but might show warnings)
  const isFeatureAccessible = useCallback(
    (featureKey: string): boolean => {
      const feature = flags.find((f) => f.feature_key === featureKey);
      if (!feature) return true;

      // Blocked statuses
      if (feature.status === "maintenance" || feature.status === "coming_soon") {
        return false;
      }

      // Check parent
      if (feature.parent_feature_key) {
        const parent = flags.find((f) => f.feature_key === feature.parent_feature_key);
        if (parent && (parent.status === "maintenance" || parent.status === "coming_soon")) {
          return false;
        }
      }

      return feature.is_enabled;
    },
    [flags]
  );

  // Get feature status
  const getFeatureStatus = useCallback(
    (featureKey: string): FeatureStatus | null => {
      const feature = flags.find((f) => f.feature_key === featureKey);
      return feature?.status || null;
    },
    [flags]
  );

  // Get feature by key
  const getFeature = useCallback(
    (featureKey: string): FeatureFlag | null => {
      return flags.find((f) => f.feature_key === featureKey) || null;
    },
    [flags]
  );

  // Get maintenance message
  const getMaintenanceMessage = useCallback(
    (featureKey: string, useMyanmarLang = false): string | null => {
      const feature = flags.find((f) => f.feature_key === featureKey);
      if (!feature) return null;

      if (useMyanmarLang && feature.maintenance_message_my) {
        return feature.maintenance_message_my;
      }
      return feature.maintenance_message || feature.status_message;
    },
    [flags]
  );

  // Get sub-features of a parent
  const getSubFeatures = useCallback(
    (parentKey: string): FeatureFlag[] => {
      return flags.filter((f) => f.parent_feature_key === parentKey);
    },
    [flags]
  );

  // Get major features (no parent)
  const getMajorFeatures = useCallback((): FeatureFlag[] => {
    return flags.filter((f) => !f.parent_feature_key);
  }, [flags]);

  // Get features by category
  const getFeaturesByCategory = useCallback(
    (category: string): FeatureFlag[] => {
      return flags.filter((f) => f.category === category && !f.parent_feature_key);
    },
    [flags]
  );

  // Check if any sub-feature is disabled
  const hasDisabledSubFeatures = useCallback(
    (parentKey: string): boolean => {
      const subFeatures = getSubFeatures(parentKey);
      return subFeatures.some((f) => !f.is_enabled || f.status === "maintenance");
    },
    [getSubFeatures]
  );

  return {
    flags,
    isLoading,
    error,
    isFeatureEnabled,
    isFeatureAccessible,
    getFeatureStatus,
    getFeature,
    getMaintenanceMessage,
    getSubFeatures,
    getMajorFeatures,
    getFeaturesByCategory,
    hasDisabledSubFeatures,
  };
}
