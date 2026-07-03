import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TransactionHistoryRow } from "@/types/transaction";

export function useTransactionHistory() {
  const { user, isAdmin } = useAuth();
  const [transactions, setTransactions] = useState<TransactionHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchTransactions();

      // Real-time subscription for new approved enrollments
      const channel = supabase
        .channel('transaction-updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'enrollments',
            filter: isAdmin ? undefined : `user_id=eq.${user.id}`
          },
          (payload) => {
            if (payload.new.status === 'approved') {
              fetchTransactions();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, isAdmin]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('enrollments')
        .select(`
          id,
          user_id,
          course_id,
          final_price,
          discount_applied,
          payment_submitted_at,
          created_at,
          payment_receipt_url,
          payment_notes,
          access_duration_days,
          access_expires_at,
          courses (
            id,
            title,
            slug,
            thumbnail_url
          ),
          coupons (
            code
          ),
          payment_methods (
            name
          )
        `)
        .eq('status', 'approved')
        .order('payment_submitted_at', { ascending: false });

      // Apply user filter for non-admin users
      if (!isAdmin && user?.id) {
        query = query.eq('user_id', user.id);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // If admin, fetch profile data separately to get user names
      let profilesMap: Record<string, string> = {};
      if (isAdmin && data && data.length > 0) {
        const userIds = [...new Set(data.map(item => item.user_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        
        if (profilesData) {
          profilesMap = profilesData.reduce((acc, profile) => {
            acc[profile.user_id] = profile.full_name || 'Unknown User';
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // Transform the data into TransactionHistoryRow format
      const transformedData: TransactionHistoryRow[] = (data || []).map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        user_name: isAdmin ? profilesMap[item.user_id] : undefined,
        course_id: item.course_id,
        course_title: item.courses?.title || 'Unknown Course',
        course_slug: item.courses?.slug || '',
        course_thumbnail_url: item.courses?.thumbnail_url,
        final_price: item.final_price || 0,
        discount_applied: item.discount_applied || 0,
        coupon_code: item.coupons?.code,
        payment_method_name: item.payment_methods?.name,
        payment_submitted_at: item.payment_submitted_at,
        created_at: item.created_at,
        payment_receipt_url: item.payment_receipt_url,
        payment_notes: item.payment_notes,
        access_duration_days: item.access_duration_days,
        access_expires_at: item.access_expires_at,
      }));

      setTransactions(transformedData);
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { transactions, loading, error, refetch: fetchTransactions };
}
