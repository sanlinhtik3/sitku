import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type FeedbackType = 'bug' | 'feature_request' | 'error' | 'feedback' | 'complaint' | 'praise';
export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FeedbackStatus = 'open' | 'in_review' | 'ai_processing' | 'awaiting_admin' | 'resolved' | 'wont_fix' | 'duplicate';

export interface UserFeedback {
  id: string;
  user_id: string;
  feedback_type: FeedbackType;
  severity: FeedbackSeverity;
  title: string;
  description: string;
  page_url: string | null;
  browser_info: Record<string, unknown> | null;
  error_details: Record<string, unknown> | null;
  attachments: Record<string, unknown> | null;
  ai_analysis: Record<string, unknown> | null;
  ai_suggested_fix: Record<string, unknown> | null;
  ai_confidence: number | null;
  ai_processed_at: string | null;
  status: FeedbackStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackDiscussion {
  id: string;
  feedback_id: string;
  author_type: 'admin' | 'beebot' | 'system';
  author_id: string | null;
  content: string;
  attachments: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateFeedbackInput {
  feedback_type: FeedbackType;
  severity?: FeedbackSeverity;
  title: string;
  description: string;
  error_details?: Record<string, unknown>;
}

// Capture browser and context info
function captureBrowserInfo() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
  };
}

export function useFeedback() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Get user's own feedback
  const { data: myFeedback, isLoading: isLoadingMyFeedback, refetch: refetchMyFeedback } = useQuery({
    queryKey: ['my-feedback', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as UserFeedback[];
    },
    enabled: !!user?.id,
  });

  // Get all feedback (admin only)
  const { data: allFeedback, isLoading: isLoadingAllFeedback, refetch: refetchAllFeedback } = useQuery({
    queryKey: ['all-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as UserFeedback[];
    },
    enabled: isAdmin,
  });

  // Submit feedback mutation
  const submitFeedback = useMutation({
    mutationFn: async (input: CreateFeedbackInput) => {
      if (!user?.id) throw new Error("Must be logged in to submit feedback");

      const browserInfo = captureBrowserInfo();
      const pageUrl = window.location.href;

      const insertData = {
        user_id: user.id,
        feedback_type: input.feedback_type,
        severity: input.severity || 'medium',
        title: input.title,
        description: input.description,
        page_url: pageUrl,
        browser_info: browserInfo as unknown as Record<string, unknown>,
        error_details: input.error_details ? input.error_details as unknown as Record<string, unknown> : null,
      };

      const { data, error } = await supabase
        .from('user_feedback')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Feedback submitted successfully! 🎉");
      queryClient.invalidateQueries({ queryKey: ['my-feedback'] });
      if (isAdmin) {
        queryClient.invalidateQueries({ queryKey: ['all-feedback'] });
      }
    },
    onError: (error) => {
      toast.error(`Failed to submit feedback: ${error.message}`);
    },
  });

  // Update feedback status (admin only)
  const updateFeedbackStatus = useMutation({
    mutationFn: async ({ id, status, resolution_notes }: { id: string; status: FeedbackStatus; resolution_notes?: string }) => {
      const updateData: Record<string, unknown> = { status };
      if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolved_by = user?.id;
      }
      if (resolution_notes) {
        updateData.resolution_notes = resolution_notes;
      }

      const { data, error } = await supabase
        .from('user_feedback')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Feedback status updated!");
      queryClient.invalidateQueries({ queryKey: ['all-feedback'] });
      queryClient.invalidateQueries({ queryKey: ['my-feedback'] });
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });

  // Get discussions for a feedback
  const useFeedbackDiscussions = (feedbackId: string) => {
    return useQuery({
      queryKey: ['feedback-discussions', feedbackId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('feedback_discussions')
          .select('*')
          .eq('feedback_id', feedbackId)
          .order('created_at', { ascending: true });
        
        if (error) throw error;
        return data as FeedbackDiscussion[];
      },
      enabled: !!feedbackId,
    });
  };

  // Add discussion message (admin only)
  const addDiscussion = useMutation({
    mutationFn: async ({ feedback_id, content, author_type = 'admin' }: { feedback_id: string; content: string; author_type?: 'admin' | 'beebot' | 'system' }) => {
      const { data, error } = await supabase
        .from('feedback_discussions')
        .insert({
          feedback_id,
          author_type,
          author_id: author_type === 'admin' ? user?.id : null,
          content,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feedback-discussions', variables.feedback_id] });
    },
    onError: (error) => {
      toast.error(`Failed to add message: ${error.message}`);
    },
  });

  // Feedback stats (admin)
  const { data: feedbackStats } = useQuery({
    queryKey: ['feedback-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_feedback')
        .select('status, severity, feedback_type');
      
      if (error) throw error;
      
      const stats = {
        total: data.length,
        open: data.filter(f => f.status === 'open').length,
        critical: data.filter(f => f.severity === 'critical').length,
        resolved: data.filter(f => f.status === 'resolved').length,
        aiProcessed: data.filter(f => f.status === 'ai_processing').length,
        byType: {
          bug: data.filter(f => f.feedback_type === 'bug').length,
          feature_request: data.filter(f => f.feedback_type === 'feature_request').length,
          error: data.filter(f => f.feedback_type === 'error').length,
          feedback: data.filter(f => f.feedback_type === 'feedback').length,
        },
      };
      
      return stats;
    },
    enabled: isAdmin,
  });

  return {
    // User's feedback
    myFeedback,
    isLoadingMyFeedback,
    refetchMyFeedback,
    
    // Admin: all feedback
    allFeedback,
    isLoadingAllFeedback,
    refetchAllFeedback,
    
    // Stats
    feedbackStats,
    
    // Actions
    submitFeedback,
    updateFeedbackStatus,
    
    // Discussions
    useFeedbackDiscussions,
    addDiscussion,
    
    // Helpers
    captureBrowserInfo,
  };
}
