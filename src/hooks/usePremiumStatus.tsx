import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface PremiumCourse {
  courseId: string;
  courseName: string;
  expiresAt: Date;
  daysRemaining: number;
}

interface PremiumStatus {
  isPremium: boolean;
  daysRemaining: number | null;
  closestExpiryDate: Date | null;
  premiumCourses: PremiumCourse[];
  loading: boolean;
}

const calculateDaysRemaining = (expiryDate: string | null): number | null => {
  if (!expiryDate) return null;
  
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays > 0 ? diffDays : 0;
};

export const usePremiumStatus = (): PremiumStatus => {
  const { user } = useAuth();
  const [premiumCourses, setPremiumCourses] = useState<PremiumCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPremiumStatus = async () => {
    if (!user) {
      setPremiumCourses([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          id,
          course_id,
          access_expires_at,
          courses (
            id,
            title
          )
        `)
        .eq("user_id", user.id)
        .eq("status", "approved")
        .eq("is_expired", false)
        .gt("access_expires_at", new Date().toISOString());

      if (!error && data) {
        const courses: PremiumCourse[] = data
          .filter(enrollment => enrollment.access_expires_at && enrollment.courses)
          .map(enrollment => ({
            courseId: enrollment.course_id,
            courseName: (enrollment.courses as any).title,
            expiresAt: new Date(enrollment.access_expires_at!),
            daysRemaining: calculateDaysRemaining(enrollment.access_expires_at) || 0,
          }))
          .filter(course => course.daysRemaining > 0);

        setPremiumCourses(courses);
      }
    } catch (error) {
      console.error("Error fetching premium status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPremiumStatus();
  }, [user]);


  const status = useMemo(() => {
    const isPremium = premiumCourses.length > 0;
    
    // Find the enrollment with the furthest expiry date (most days remaining)
    const furthestExpiry = premiumCourses.reduce<PremiumCourse | null>(
      (furthest, current) => {
        if (!furthest || current.daysRemaining > furthest.daysRemaining) {
          return current;
        }
        return furthest;
      },
      null
    );

    return {
      isPremium,
      daysRemaining: furthestExpiry?.daysRemaining || null,
      closestExpiryDate: furthestExpiry?.expiresAt || null,
      premiumCourses,
      loading,
    };
  }, [premiumCourses, loading]);

  return status;
};
