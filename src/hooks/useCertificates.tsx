import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface CertificateData {
  course_title: string;
  instructor_name: string | null;
  completion_date: string;
  total_lessons: number;
}

interface Certificate {
  id: string;
  course_id: string;
  issued_at: string;
  certificate_data: CertificateData;
}

export const useCertificates = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setCertificates([]);
      setLoading(false);
      return;
    }

    fetchCertificates();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('user-certificates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'certificates',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchCertificates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchCertificates = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("certificates")
      .select("*")
      .eq("user_id", user.id)
      .order("issued_at", { ascending: false });

    if (!error && data) {
      const typedCertificates = data.map(cert => ({
        id: cert.id,
        course_id: cert.course_id,
        issued_at: cert.issued_at,
        certificate_data: cert.certificate_data as unknown as CertificateData
      }));
      setCertificates(typedCertificates);
    }
    setLoading(false);
  };

  return {
    certificates,
    loading,
    refetch: fetchCertificates
  };
};
