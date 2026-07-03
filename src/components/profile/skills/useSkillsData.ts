import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Skill } from "./types";

export function useSkillsData() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["user-skills", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("agent_custom_skills")
        .select("*")
        .eq("user_id", user.id)
        .order("use_count", { ascending: false });
      if (error) throw error;
      return (data || []) as Skill[];
    },
    enabled: !!user?.id,
    refetchInterval: 15000, // Auto-sync with agent-created skills
  });

  const toggleSkill = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("agent_custom_skills")
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-skills"] }),
  });

  const deleteSkill = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_custom_skills").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-skills"] });
      toast.success("Skill deleted");
    },
  });

  const createSkill = useMutation({
    mutationFn: async (skill: {
      skill_name: string;
      description: string;
      trigger_keywords: string[];
      execution_steps: any;
      input_schema: any;
      created_by_agent?: boolean;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await supabase.from("agent_custom_skills").insert({
        user_id: user.id,
        skill_name: skill.skill_name,
        description: skill.description,
        trigger_keywords: skill.trigger_keywords,
        execution_steps: skill.execution_steps,
        input_schema: skill.input_schema,
        created_by_agent: skill.created_by_agent ?? false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-skills"] });
      toast.success("Skill created! BeeBot will learn and use it. 🐝");
    },
  });

  const updateSkill = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { skill_name?: string; description?: string; trigger_keywords?: string[] } }) => {
      const { error } = await supabase
        .from("agent_custom_skills")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-skills"] }),
  });

  const refreshSkills = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["user-skills"] });
  }, [queryClient]);

  return { skills, isLoading, toggleSkill, deleteSkill, createSkill, updateSkill, refreshSkills, user };
}
