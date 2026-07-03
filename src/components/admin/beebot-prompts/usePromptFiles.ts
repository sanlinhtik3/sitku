import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PromptFile, PromptHistory } from "./types";

export function usePromptFiles() {
  const queryClient = useQueryClient();

  const { data: promptFiles, isLoading, refetch } = useQuery({
    queryKey: ["agent-prompt-files"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_prompt_files")
        .select("*")
        .order("order_index", { ascending: true });

      if (error) throw error;
      return data as PromptFile[];
    },
  });

  const createPromptFile = useMutation({
    mutationFn: async (newFile: Partial<PromptFile>) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("agent_prompt_files")
        .insert({
          file_name: newFile.file_name,
          display_name: newFile.display_name || newFile.file_name?.replace('.md', ''),
          content: newFile.content || '',
          file_type: newFile.file_type || 'static',
          category: newFile.category || 'custom',
          is_active: newFile.is_active ?? true,
          is_required: false,
          order_index: newFile.order_index || 999,
          variables: newFile.variables || [],
          description: newFile.description,
          updated_by: user.user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-prompt-files"] });
      toast.success("Prompt file created");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create: ${error.message}`);
    },
  });

  const updatePromptFile = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PromptFile> }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("agent_prompt_files")
        .update({
          ...updates,
          updated_by: user.user.id,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-prompt-files"] });
      toast.success("Prompt file updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const deletePromptFile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agent_prompt_files")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-prompt-files"] });
      toast.success("Prompt file deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const reorderPromptFiles = useMutation({
    mutationFn: async (orderedIds: { id: string; order_index: number }[]) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      for (const item of orderedIds) {
        const { error } = await supabase
          .from("agent_prompt_files")
          .update({ order_index: item.order_index, updated_by: user.user.id })
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-prompt-files"] });
      toast.success("Order updated");
    },
  });

  return {
    promptFiles,
    isLoading,
    refetch,
    createPromptFile,
    updatePromptFile,
    deletePromptFile,
    reorderPromptFiles,
  };
}

export function usePromptHistory(promptFileId: string | null) {
  const { data: history, isLoading } = useQuery({
    queryKey: ["agent-prompt-history", promptFileId],
    queryFn: async () => {
      if (!promptFileId) return [];
      
      const { data, error } = await supabase
        .from("agent_prompt_history")
        .select("*")
        .eq("prompt_file_id", promptFileId)
        .order("version", { ascending: false });

      if (error) throw error;
      return data as PromptHistory[];
    },
    enabled: !!promptFileId,
  });

  return { history, isLoading };
}
