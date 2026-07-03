export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          created_at: string | null
          description: string
          icon: string
          id: string
          name: string
          requirement_type: string
          requirement_value: number
        }
        Insert: {
          created_at?: string | null
          description: string
          icon: string
          id?: string
          name: string
          requirement_type: string
          requirement_value?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          icon?: string
          id?: string
          name?: string
          requirement_type?: string
          requirement_value?: number
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_ai_usage: {
        Row: {
          api_source: string
          cache_type: string | null
          cached_tokens: number | null
          call_kind: string | null
          client_request_id: string | null
          created_at: string | null
          error_message: string | null
          estimated_cost: number | null
          estimated_iu: number | null
          first_token_ms: number | null
          id: string
          is_successful: boolean | null
          message_id: string | null
          metadata: Json
          model_used: string
          parent_run_id: string | null
          provider: string | null
          request_count: number
          request_duration_ms: number | null
          run_id: string | null
          session_id: string | null
          stream_duration_ms: number | null
          task_id: string | null
          tokens_input: number | null
          tokens_output: number | null
          tokens_per_sec: number | null
          tokens_total: number | null
          trace_id: string | null
          user_id: string
          widget_rendered: boolean
          widget_should_have_rendered: boolean
        }
        Insert: {
          api_source: string
          cache_type?: string | null
          cached_tokens?: number | null
          call_kind?: string | null
          client_request_id?: string | null
          created_at?: string | null
          error_message?: string | null
          estimated_cost?: number | null
          estimated_iu?: number | null
          first_token_ms?: number | null
          id?: string
          is_successful?: boolean | null
          message_id?: string | null
          metadata?: Json
          model_used: string
          parent_run_id?: string | null
          provider?: string | null
          request_count?: number
          request_duration_ms?: number | null
          run_id?: string | null
          session_id?: string | null
          stream_duration_ms?: number | null
          task_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_per_sec?: number | null
          tokens_total?: number | null
          trace_id?: string | null
          user_id: string
          widget_rendered?: boolean
          widget_should_have_rendered?: boolean
        }
        Update: {
          api_source?: string
          cache_type?: string | null
          cached_tokens?: number | null
          call_kind?: string | null
          client_request_id?: string | null
          created_at?: string | null
          error_message?: string | null
          estimated_cost?: number | null
          estimated_iu?: number | null
          first_token_ms?: number | null
          id?: string
          is_successful?: boolean | null
          message_id?: string | null
          metadata?: Json
          model_used?: string
          parent_run_id?: string | null
          provider?: string | null
          request_count?: number
          request_duration_ms?: number | null
          run_id?: string | null
          session_id?: string | null
          stream_duration_ms?: number | null
          task_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_per_sec?: number | null
          tokens_total?: number | null
          trace_id?: string | null
          user_id?: string
          widget_rendered?: boolean
          widget_should_have_rendered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agent_ai_usage_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_ai_usage_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_auto_sync_rules: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          insight_types: string[]
          is_active: boolean | null
          last_synced_at: string | null
          min_confidence: number | null
          rule_name: string
          sync_frequency: string
          topic_pattern: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          insight_types?: string[]
          is_active?: boolean | null
          last_synced_at?: string | null
          min_confidence?: number | null
          rule_name: string
          sync_frequency: string
          topic_pattern: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          insight_types?: string[]
          is_active?: boolean | null
          last_synced_at?: string | null
          min_confidence?: number | null
          rule_name?: string
          sync_frequency?: string
          topic_pattern?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_autonomous_actions: {
        Row: {
          action_details: Json
          action_type: string
          confidence_score: number
          created_at: string | null
          id: string
          outcome: string | null
          outcome_details: Json | null
          required_confirmation: boolean | null
          risk_level: string
          session_id: string | null
          trust_level: number
          user_confirmed: boolean | null
          user_id: string
          was_auto_executed: boolean | null
        }
        Insert: {
          action_details?: Json
          action_type: string
          confidence_score: number
          created_at?: string | null
          id?: string
          outcome?: string | null
          outcome_details?: Json | null
          required_confirmation?: boolean | null
          risk_level: string
          session_id?: string | null
          trust_level: number
          user_confirmed?: boolean | null
          user_id: string
          was_auto_executed?: boolean | null
        }
        Update: {
          action_details?: Json
          action_type?: string
          confidence_score?: number
          created_at?: string | null
          id?: string
          outcome?: string | null
          outcome_details?: Json | null
          required_confirmation?: boolean | null
          risk_level?: string
          session_id?: string | null
          trust_level?: number
          user_confirmed?: boolean | null
          user_id?: string
          was_auto_executed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_autonomous_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chat_messages: {
        Row: {
          attachments: Json | null
          content: string
          content_tsv: unknown
          created_at: string | null
          feedback_at: string | null
          feedback_text: string | null
          id: string
          is_error: boolean | null
          is_shared: boolean | null
          pre_thread_content: string | null
          response_rating: string | null
          role: string
          session_id: string
          share_uid: string | null
          shared_at: string | null
          source_channel: string | null
          thoughts: Json | null
          thread_applied_at: string | null
          tool_calls: Json | null
          tool_results: Json | null
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          content_tsv?: unknown
          created_at?: string | null
          feedback_at?: string | null
          feedback_text?: string | null
          id?: string
          is_error?: boolean | null
          is_shared?: boolean | null
          pre_thread_content?: string | null
          response_rating?: string | null
          role: string
          session_id: string
          share_uid?: string | null
          shared_at?: string | null
          source_channel?: string | null
          thoughts?: Json | null
          thread_applied_at?: string | null
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          content_tsv?: unknown
          created_at?: string | null
          feedback_at?: string | null
          feedback_text?: string | null
          id?: string
          is_error?: boolean | null
          is_shared?: boolean | null
          pre_thread_content?: string | null
          response_rating?: string | null
          role?: string
          session_id?: string
          share_uid?: string | null
          shared_at?: string | null
          source_channel?: string | null
          thoughts?: Json | null
          thread_applied_at?: string | null
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chat_sessions: {
        Row: {
          context_summary: string | null
          created_at: string | null
          global_session_state: Json | null
          id: string
          is_active: boolean | null
          last_dream_at: string | null
          last_message_at: string | null
          lease_acquired_at: string | null
          lease_expires_at: string | null
          lease_holder_id: string | null
          message_count: number | null
          metadata: Json | null
          processing_lock: string | null
          project_id: string | null
          session_instructions: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context_summary?: string | null
          created_at?: string | null
          global_session_state?: Json | null
          id?: string
          is_active?: boolean | null
          last_dream_at?: string | null
          last_message_at?: string | null
          lease_acquired_at?: string | null
          lease_expires_at?: string | null
          lease_holder_id?: string | null
          message_count?: number | null
          metadata?: Json | null
          processing_lock?: string | null
          project_id?: string | null
          session_instructions?: string | null
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context_summary?: string | null
          created_at?: string | null
          global_session_state?: Json | null
          id?: string
          is_active?: boolean | null
          last_dream_at?: string | null
          last_message_at?: string | null
          lease_acquired_at?: string | null
          lease_expires_at?: string | null
          lease_holder_id?: string | null
          message_count?: number | null
          metadata?: Json | null
          processing_lock?: string | null
          project_id?: string | null
          session_instructions?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_communication_log: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          query_content: string
          query_type: string
          requester_agent_id: string
          response_summary: string | null
          target_agent_id: string | null
          target_type: string
          was_successful: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          query_content: string
          query_type: string
          requester_agent_id: string
          response_summary?: string | null
          target_agent_id?: string | null
          target_type: string
          was_successful?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          query_content?: string
          query_type?: string
          requester_agent_id?: string
          response_summary?: string | null
          target_agent_id?: string | null
          target_type?: string
          was_successful?: boolean | null
        }
        Relationships: []
      }
      agent_conversations: {
        Row: {
          context: Json | null
          conversation_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          message_content: string
          message_type: string
          priority: string | null
          receiver_agent_id: string | null
          response_to: string | null
          sender_agent_id: string
        }
        Insert: {
          context?: Json | null
          conversation_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message_content: string
          message_type: string
          priority?: string | null
          receiver_agent_id?: string | null
          response_to?: string | null
          sender_agent_id: string
        }
        Update: {
          context?: Json | null
          conversation_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message_content?: string
          message_type?: string
          priority?: string | null
          receiver_agent_id?: string | null
          response_to?: string | null
          sender_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_response_to_fkey"
            columns: ["response_to"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_critique_log: {
        Row: {
          created_at: string
          critique_model: string | null
          id: string
          issues: Json
          latency_ms: number | null
          message_id: string | null
          original_draft: string
          refined_answer: string | null
          session_id: string | null
          user_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          critique_model?: string | null
          id?: string
          issues?: Json
          latency_ms?: number | null
          message_id?: string | null
          original_draft: string
          refined_answer?: string | null
          session_id?: string | null
          user_id: string
          verdict: string
        }
        Update: {
          created_at?: string
          critique_model?: string | null
          id?: string
          issues?: Json
          latency_ms?: number | null
          message_id?: string | null
          original_draft?: string
          refined_answer?: string | null
          session_id?: string | null
          user_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_critique_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_critique_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_custom_skills: {
        Row: {
          approved_at: string | null
          created_at: string | null
          created_by_agent: boolean | null
          description: string | null
          execution_steps: Json
          id: string
          input_schema: Json | null
          is_active: boolean | null
          last_used_at: string | null
          output_format: string | null
          portable_manifest: Json
          proposal_evidence: Json | null
          proposal_reason: string | null
          rejected_at: string | null
          skill_name: string
          source_url: string | null
          standard_format: string
          status: Database["public"]["Enums"]["skill_status"]
          trigger_keywords: string[] | null
          updated_at: string | null
          use_count: number | null
          user_id: string
          version: number | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string | null
          created_by_agent?: boolean | null
          description?: string | null
          execution_steps?: Json
          id?: string
          input_schema?: Json | null
          is_active?: boolean | null
          last_used_at?: string | null
          output_format?: string | null
          portable_manifest?: Json
          proposal_evidence?: Json | null
          proposal_reason?: string | null
          rejected_at?: string | null
          skill_name: string
          source_url?: string | null
          standard_format?: string
          status?: Database["public"]["Enums"]["skill_status"]
          trigger_keywords?: string[] | null
          updated_at?: string | null
          use_count?: number | null
          user_id: string
          version?: number | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string | null
          created_by_agent?: boolean | null
          description?: string | null
          execution_steps?: Json
          id?: string
          input_schema?: Json | null
          is_active?: boolean | null
          last_used_at?: string | null
          output_format?: string | null
          portable_manifest?: Json
          proposal_evidence?: Json | null
          proposal_reason?: string | null
          rejected_at?: string | null
          skill_name?: string
          source_url?: string | null
          standard_format?: string
          status?: Database["public"]["Enums"]["skill_status"]
          trigger_keywords?: string[] | null
          updated_at?: string | null
          use_count?: number | null
          user_id?: string
          version?: number | null
        }
        Relationships: []
      }
      agent_daily_logs: {
        Row: {
          content: string
          id: string
          log_date: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          id?: string
          log_date?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          id?: string
          log_date?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_eval_results: {
        Row: {
          created_at: string | null
          id: string
          latency_ms: number | null
          model_used: string
          passed: boolean
          quality_score: number | null
          reasoning_effort: string | null
          response_snippet: string | null
          run_id: string
          test_id: string
          tokens_used: number | null
          tools_called: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          latency_ms?: number | null
          model_used: string
          passed?: boolean
          quality_score?: number | null
          reasoning_effort?: string | null
          response_snippet?: string | null
          run_id: string
          test_id: string
          tokens_used?: number | null
          tools_called?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          latency_ms?: number | null
          model_used?: string
          passed?: boolean
          quality_score?: number | null
          reasoning_effort?: string | null
          response_snippet?: string | null
          run_id?: string
          test_id?: string
          tokens_used?: number | null
          tools_called?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_eval_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "agent_eval_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_eval_tests: {
        Row: {
          category: string
          complexity_tier: string | null
          created_at: string | null
          created_by: string | null
          expected_tools: string[] | null
          id: string
          input_message: string
          is_active: boolean | null
          min_quality_score: number | null
          quality_keywords: string[] | null
          updated_at: string | null
        }
        Insert: {
          category?: string
          complexity_tier?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_tools?: string[] | null
          id?: string
          input_message: string
          is_active?: boolean | null
          min_quality_score?: number | null
          quality_keywords?: string[] | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          complexity_tier?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_tools?: string[] | null
          id?: string
          input_message?: string
          is_active?: boolean | null
          min_quality_score?: number | null
          quality_keywords?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_goals: {
        Row: {
          completed_at: string | null
          config: Json
          created_at: string
          deadline_at: string | null
          description: string | null
          goal_type: string
          id: string
          priority: number
          progress: Json
          started_at: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          deadline_at?: string | null
          description?: string | null
          goal_type?: string
          id?: string
          priority?: number
          progress?: Json
          started_at?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          deadline_at?: string | null
          description?: string | null
          goal_type?: string
          id?: string
          priority?: number
          progress?: Json
          started_at?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_guard_effectiveness: {
        Row: {
          avg_retry_latency_ms: number | null
          effectiveness_score: number | null
          false_positive_count: number
          guard_name: string
          id: string
          improvement_count: number
          last_triggered_at: string | null
          period_start: string
          trigger_count: number
          updated_at: string
        }
        Insert: {
          avg_retry_latency_ms?: number | null
          effectiveness_score?: number | null
          false_positive_count?: number
          guard_name: string
          id?: string
          improvement_count?: number
          last_triggered_at?: string | null
          period_start?: string
          trigger_count?: number
          updated_at?: string
        }
        Update: {
          avg_retry_latency_ms?: number | null
          effectiveness_score?: number | null
          false_positive_count?: number
          guard_name?: string
          id?: string
          improvement_count?: number
          last_triggered_at?: string | null
          period_start?: string
          trigger_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      agent_health_anomalies: {
        Row: {
          anomaly_type: string
          created_at: string
          description: string
          id: string
          metadata: Json | null
          metric_value: number | null
          resolved: boolean
          resolved_at: string | null
          severity: string
          source: string
          threshold_value: number | null
        }
        Insert: {
          anomaly_type: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          metric_value?: number | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          source: string
          threshold_value?: number | null
        }
        Update: {
          anomaly_type?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          metric_value?: number | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          source?: string
          threshold_value?: number | null
        }
        Relationships: []
      }
      agent_heartbeat_logs: {
        Row: {
          created_at: string | null
          heartbeat_id: string
          id: string
          result: Json | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          heartbeat_id: string
          id?: string
          result?: Json | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          heartbeat_id?: string
          id?: string
          result?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_heartbeat_logs_heartbeat_id_fkey"
            columns: ["heartbeat_id"]
            isOneToOne: false
            referencedRelation: "agent_heartbeats"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_heartbeats: {
        Row: {
          action_count: number
          created_at: string
          cron_expression: string | null
          display_name: string
          event_config: Json | null
          id: string
          is_active: boolean
          last_result: Json | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string | null
          priority: string
          skip_count: number
          task_config: Json | null
          task_subtype: string | null
          task_type: string
          trigger_type: string
          user_id: string
        }
        Insert: {
          action_count?: number
          created_at?: string
          cron_expression?: string | null
          display_name: string
          event_config?: Json | null
          id?: string
          is_active?: boolean
          last_result?: Json | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string | null
          priority?: string
          skip_count?: number
          task_config?: Json | null
          task_subtype?: string | null
          task_type?: string
          trigger_type?: string
          user_id: string
        }
        Update: {
          action_count?: number
          created_at?: string
          cron_expression?: string | null
          display_name?: string
          event_config?: Json | null
          id?: string
          is_active?: boolean
          last_result?: Json | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          priority?: string
          skip_count?: number
          task_config?: Json | null
          task_subtype?: string | null
          task_type?: string
          trigger_type?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_knowledge_gaps: {
        Row: {
          flagged_at: string
          id: string
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          topic: string
          user_id: string
        }
        Insert: {
          flagged_at?: string
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          topic: string
          user_id: string
        }
        Update: {
          flagged_at?: string
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_gaps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge_synthesis: {
        Row: {
          approved_by: string | null
          category: string | null
          created_at: string | null
          id: string
          is_approved: boolean | null
          language: string | null
          last_synthesized_at: string | null
          quality_score: number | null
          source_count: number | null
          synthesized_knowledge: Json
          topic: string
        }
        Insert: {
          approved_by?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          language?: string | null
          last_synthesized_at?: string | null
          quality_score?: number | null
          source_count?: number | null
          synthesized_knowledge?: Json
          topic: string
        }
        Update: {
          approved_by?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          language?: string | null
          last_synthesized_at?: string | null
          quality_score?: number | null
          source_count?: number | null
          synthesized_knowledge?: Json
          topic?: string
        }
        Relationships: []
      }
      agent_learning_context: {
        Row: {
          context_key: string
          context_type: string
          context_value: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          context_key: string
          context_type: string
          context_value: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          context_key?: string
          context_type?: string
          context_value?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      agent_loop_checkpoints: {
        Row: {
          created_at: string | null
          id: string
          is_success: boolean | null
          mission_id: string
          session_id: string
          step_index: number
          tool_arguments: Json | null
          tool_name: string
          tool_result: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_success?: boolean | null
          mission_id: string
          session_id: string
          step_index: number
          tool_arguments?: Json | null
          tool_name: string
          tool_result?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_success?: boolean | null
          mission_id?: string
          session_id?: string
          step_index?: number
          tool_arguments?: Json | null
          tool_name?: string
          tool_result?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      agent_model_performance: {
        Row: {
          avg_guard_retries: number
          avg_latency_ms: number
          avg_output_length: number
          complexity_tier: string
          failed_requests: number
          id: string
          last_used_at: string | null
          model: string
          p95_latency_ms: number
          period_start: string
          quality_score: number
          success_rate: number
          successful_requests: number
          task_type: string
          total_requests: number
          updated_at: string
        }
        Insert: {
          avg_guard_retries?: number
          avg_latency_ms?: number
          avg_output_length?: number
          complexity_tier?: string
          failed_requests?: number
          id?: string
          last_used_at?: string | null
          model: string
          p95_latency_ms?: number
          period_start?: string
          quality_score?: number
          success_rate?: number
          successful_requests?: number
          task_type?: string
          total_requests?: number
          updated_at?: string
        }
        Update: {
          avg_guard_retries?: number
          avg_latency_ms?: number
          avg_output_length?: number
          complexity_tier?: string
          failed_requests?: number
          id?: string
          last_used_at?: string | null
          model?: string
          p95_latency_ms?: number
          period_start?: string
          quality_score?: number
          success_rate?: number
          successful_requests?: number
          task_type?: string
          total_requests?: number
          updated_at?: string
        }
        Relationships: []
      }
      agent_proactive_suggestions: {
        Row: {
          context_trigger: string
          created_at: string | null
          id: string
          session_id: string | null
          suggestion_content: string
          suggestion_type: string
          urgency: string | null
          user_feedback: string | null
          user_id: string
          was_accepted: boolean | null
          was_helpful: boolean | null
        }
        Insert: {
          context_trigger: string
          created_at?: string | null
          id?: string
          session_id?: string | null
          suggestion_content: string
          suggestion_type: string
          urgency?: string | null
          user_feedback?: string | null
          user_id: string
          was_accepted?: boolean | null
          was_helpful?: boolean | null
        }
        Update: {
          context_trigger?: string
          created_at?: string | null
          id?: string
          session_id?: string | null
          suggestion_content?: string
          suggestion_type?: string
          urgency?: string | null
          user_feedback?: string | null
          user_id?: string
          was_accepted?: boolean | null
          was_helpful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_proactive_suggestions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_projects: {
        Row: {
          color: string | null
          created_at: string
          custom_instructions: string | null
          description: string | null
          emoji: string | null
          id: string
          name: string
          pinned_artifact_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          custom_instructions?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          name: string
          pinned_artifact_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          custom_instructions?: string | null
          description?: string | null
          emoji?: string | null
          id?: string
          name?: string
          pinned_artifact_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_prompt_files: {
        Row: {
          category: string
          content: string
          created_at: string
          description: string | null
          display_name: string
          file_name: string
          file_type: string
          id: string
          is_active: boolean
          is_required: boolean
          module_tags: string[] | null
          order_index: number
          updated_at: string
          updated_by: string | null
          variables: Json | null
          version: number
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          description?: string | null
          display_name: string
          file_name: string
          file_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          module_tags?: string[] | null
          order_index?: number
          updated_at?: string
          updated_by?: string | null
          variables?: Json | null
          version?: number
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          description?: string | null
          display_name?: string
          file_name?: string
          file_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          module_tags?: string[] | null
          order_index?: number
          updated_at?: string
          updated_by?: string | null
          variables?: Json | null
          version?: number
        }
        Relationships: []
      }
      agent_prompt_history: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_by: string | null
          content: string
          file_name: string
          id: string
          prompt_file_id: string
          version: number
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          content: string
          file_name: string
          id?: string
          prompt_file_id: string
          version: number
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          content?: string
          file_name?: string
          id?: string
          prompt_file_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompt_history_prompt_file_id_fkey"
            columns: ["prompt_file_id"]
            isOneToOne: false
            referencedRelation: "agent_prompt_files"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_prompt_templates: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          prompt_text: string
          title: string
          usage_count: number | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          prompt_text: string
          title: string
          usage_count?: number | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          prompt_text?: string
          title?: string
          usage_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_provider_health: {
        Row: {
          avg_latency_ms: number | null
          cooldown_until: string | null
          health_score: number
          id: string
          last_error_at: string | null
          last_error_type: string | null
          last_success_at: string | null
          model: string
          p95_latency_ms: number | null
          provider_key_hash: string
          total_errors: number
          total_requests: number
          total_timeouts: number
          updated_at: string
        }
        Insert: {
          avg_latency_ms?: number | null
          cooldown_until?: string | null
          health_score?: number
          id?: string
          last_error_at?: string | null
          last_error_type?: string | null
          last_success_at?: string | null
          model: string
          p95_latency_ms?: number | null
          provider_key_hash: string
          total_errors?: number
          total_requests?: number
          total_timeouts?: number
          updated_at?: string
        }
        Update: {
          avg_latency_ms?: number | null
          cooldown_until?: string | null
          health_score?: number
          id?: string
          last_error_at?: string | null
          last_error_type?: string | null
          last_success_at?: string | null
          model?: string
          p95_latency_ms?: number | null
          provider_key_hash?: string
          total_errors?: number
          total_requests?: number
          total_timeouts?: number
          updated_at?: string
        }
        Relationships: []
      }
      agent_response_feedback_insights: {
        Row: {
          analyzed_at: string | null
          common_issues: Json | null
          helpful_count: number | null
          id: string
          improvement_suggestions: Json | null
          not_helpful_count: number | null
          period_start: string
          satisfaction_rate: number | null
          time_period: string
          total_rated: number | null
        }
        Insert: {
          analyzed_at?: string | null
          common_issues?: Json | null
          helpful_count?: number | null
          id?: string
          improvement_suggestions?: Json | null
          not_helpful_count?: number | null
          period_start: string
          satisfaction_rate?: number | null
          time_period: string
          total_rated?: number | null
        }
        Update: {
          analyzed_at?: string | null
          common_issues?: Json | null
          helpful_count?: number | null
          id?: string
          improvement_suggestions?: Json | null
          not_helpful_count?: number | null
          period_start?: string
          satisfaction_rate?: number | null
          time_period?: string
          total_rated?: number | null
        }
        Relationships: []
      }
      agent_self_improvements: {
        Row: {
          applied_count: number | null
          confidence: number | null
          created_at: string | null
          id: string
          improvement_type: string
          insight: string
          is_active: boolean | null
          learned_from: Json | null
          priority: string | null
          success_rate: number | null
          updated_at: string | null
        }
        Insert: {
          applied_count?: number | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          improvement_type: string
          insight: string
          is_active?: boolean | null
          learned_from?: Json | null
          priority?: string | null
          success_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          applied_count?: number | null
          confidence?: number | null
          created_at?: string | null
          id?: string
          improvement_type?: string
          insight?: string
          is_active?: boolean | null
          learned_from?: Json | null
          priority?: string | null
          success_rate?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_shared_insights: {
        Row: {
          confidence_score: number | null
          content: Json
          created_at: string | null
          expires_at: string | null
          id: string
          insight_type: string
          is_anonymous: boolean | null
          source_agent_id: string | null
          topic: string
          updated_at: string | null
          verification_count: number | null
          verified_by: string[] | null
        }
        Insert: {
          confidence_score?: number | null
          content?: Json
          created_at?: string | null
          expires_at?: string | null
          id?: string
          insight_type: string
          is_anonymous?: boolean | null
          source_agent_id?: string | null
          topic: string
          updated_at?: string | null
          verification_count?: number | null
          verified_by?: string[] | null
        }
        Update: {
          confidence_score?: number | null
          content?: Json
          created_at?: string | null
          expires_at?: string | null
          id?: string
          insight_type?: string
          is_anonymous?: boolean | null
          source_agent_id?: string | null
          topic?: string
          updated_at?: string | null
          verification_count?: number | null
          verified_by?: string[] | null
        }
        Relationships: []
      }
      agent_skills: {
        Row: {
          created_at: string | null
          id: string
          instructions_md: string | null
          last_used_at: string | null
          mastery_level: number | null
          skill_category: string
          skill_data: Json | null
          skill_name: string
          unlocked_at: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          instructions_md?: string | null
          last_used_at?: string | null
          mastery_level?: number | null
          skill_category: string
          skill_data?: Json | null
          skill_name: string
          unlocked_at?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          instructions_md?: string | null
          last_used_at?: string | null
          mastery_level?: number | null
          skill_category?: string
          skill_data?: Json | null
          skill_name?: string
          unlocked_at?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      agent_soul_config: {
        Row: {
          dream_lock: boolean | null
          last_dream_at: string | null
          sessions_since_dream: number | null
          soul_text: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          dream_lock?: boolean | null
          last_dream_at?: string | null
          sessions_since_dream?: number | null
          soul_text?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          dream_lock?: boolean | null
          last_dream_at?: string | null
          sessions_since_dream?: number | null
          soul_text?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_sub_agent_steps: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          parent_message_id: string | null
          session_id: string | null
          status: string
          step_index: number
          sub_agent_id: string
          tool_args: Json | null
          tool_name: string | null
          tool_result: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          parent_message_id?: string | null
          session_id?: string | null
          status?: string
          step_index?: number
          sub_agent_id: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          parent_message_id?: string | null
          session_id?: string | null
          status?: string
          step_index?: number
          sub_agent_id?: string
          tool_args?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      agent_sub_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          parent_session_id: string
          result: Json | null
          status: string
          task_description: string
          tokens_used: number | null
          tools_used: string[] | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          parent_session_id: string
          result?: Json | null
          status?: string
          task_description: string
          tokens_used?: number | null
          tools_used?: string[] | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          parent_session_id?: string
          result?: Json | null
          status?: string
          task_description?: string
          tokens_used?: number | null
          tools_used?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_sub_tasks_parent_session_id_fkey"
            columns: ["parent_session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_swarm_scratchpad: {
        Row: {
          created_at: string | null
          findings: string
          id: string
          metadata: Json | null
          specialist_role: string
          step_id: string
          swarm_id: string
        }
        Insert: {
          created_at?: string | null
          findings: string
          id?: string
          metadata?: Json | null
          specialist_role: string
          step_id: string
          swarm_id: string
        }
        Update: {
          created_at?: string | null
          findings?: string
          id?: string
          metadata?: Json | null
          specialist_role?: string
          step_id?: string
          swarm_id?: string
        }
        Relationships: []
      }
      agent_task_queue: {
        Row: {
          attempt_count: number
          checkpoint_state: Json | null
          completed_at: string | null
          created_at: string
          goal_id: string
          id: string
          max_attempts: number
          payload: Json
          priority: number
          result: Json | null
          scheduled_for: string
          started_at: string | null
          status: string
          task_type: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          checkpoint_state?: Json | null
          completed_at?: string | null
          created_at?: string
          goal_id: string
          id?: string
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          task_type: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          checkpoint_state?: Json | null
          completed_at?: string | null
          created_at?: string
          goal_id?: string
          id?: string
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          task_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_task_queue_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "agent_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_teachings: {
        Row: {
          adoption_count: number | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          effectiveness_score: number | null
          id: string
          is_approved: boolean | null
          source_agent: string | null
          source_improvement_id: string | null
          target_audience: string | null
          teaching_content: Json
          teaching_type: string
          updated_at: string | null
        }
        Insert: {
          adoption_count?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          is_approved?: boolean | null
          source_agent?: string | null
          source_improvement_id?: string | null
          target_audience?: string | null
          teaching_content?: Json
          teaching_type: string
          updated_at?: string | null
        }
        Update: {
          adoption_count?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          is_approved?: boolean | null
          source_agent?: string | null
          source_improvement_id?: string | null
          target_audience?: string | null
          teaching_content?: Json
          teaching_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_teachings_source_improvement_id_fkey"
            columns: ["source_improvement_id"]
            isOneToOne: false
            referencedRelation: "agent_self_improvements"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_telemetry_spans: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          metadata: Json | null
          session_id: string | null
          span_name: string
          span_type: string
          status: string
          trace_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms: number
          id?: string
          metadata?: Json | null
          session_id?: string | null
          span_name: string
          span_type: string
          status?: string
          trace_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          metadata?: Json | null
          session_id?: string | null
          span_name?: string
          span_type?: string
          status?: string
          trace_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_telemetry_spans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_thought_trees: {
        Row: {
          candidate_plans: Json
          created_at: string
          evaluator_model: string | null
          id: string
          latency_ms: number | null
          message_id: string | null
          selected_plan_id: string
          selection_reasoning: string | null
          session_id: string | null
          user_id: string
          user_message: string | null
        }
        Insert: {
          candidate_plans: Json
          created_at?: string
          evaluator_model?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          selected_plan_id: string
          selection_reasoning?: string | null
          session_id?: string | null
          user_id: string
          user_message?: string | null
        }
        Update: {
          candidate_plans?: Json
          created_at?: string
          evaluator_model?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          selected_plan_id?: string
          selection_reasoning?: string | null
          session_id?: string | null
          user_id?: string
          user_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_thought_trees_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_thought_trees_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tool_definitions: {
        Row: {
          category: string
          created_at: string
          description: string
          embedding: string | null
          id: string
          is_active: boolean
          parameters: Json
          requires_admin: boolean
          tool_name: string
          trigger_keywords: string[]
          updated_at: string
          usage_count: number
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          embedding?: string | null
          id?: string
          is_active?: boolean
          parameters?: Json
          requires_admin?: boolean
          tool_name: string
          trigger_keywords?: string[]
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          embedding?: string | null
          id?: string
          is_active?: boolean
          parameters?: Json
          requires_admin?: boolean
          tool_name?: string
          trigger_keywords?: string[]
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      agent_tool_permissions: {
        Row: {
          created_at: string
          id: string
          pattern: string
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pattern: string
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pattern?: string
          permission?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_tool_telemetry: {
        Row: {
          duration_ms: number | null
          error_summary: string | null
          id: string
          invoked_at: string
          is_successful: boolean
          message_id: string | null
          session_id: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          duration_ms?: number | null
          error_summary?: string | null
          id?: string
          invoked_at?: string
          is_successful?: boolean
          message_id?: string | null
          session_id?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          duration_ms?: number | null
          error_summary?: string | null
          id?: string
          invoked_at?: string
          is_successful?: boolean
          message_id?: string | null
          session_id?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_user_facts: {
        Row: {
          created_at: string | null
          fact_key: string
          fact_value: string
          id: string
          source: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          fact_key: string
          fact_value: string
          id?: string
          source?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          fact_key?: string
          fact_value?: string
          id?: string
          source?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_user_traits: {
        Row: {
          confidence: number
          created_at: string
          evidence_refs: Json
          id: string
          status: string
          trait_key: string
          trait_value: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          evidence_refs?: Json
          id?: string
          status?: string
          trait_key: string
          trait_value: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          evidence_refs?: Json
          id?: string
          status?: string
          trait_key?: string
          trait_value?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agentic_agent_actions: {
        Row: {
          action_type: string
          created_at: string
          id: string
          payload: Json
          result: Json | null
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          payload?: Json
          result?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          payload?: Json
          result?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      agentic_anomalies: {
        Row: {
          acknowledged: boolean
          channel_id: string | null
          created_at: string
          delta_pct: number | null
          detected_at: string
          expected: number | null
          explanation: string | null
          id: string
          metric_type: Database["public"]["Enums"]["agentic_metric_type"]
          observed: number | null
          severity: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          channel_id?: string | null
          created_at?: string
          delta_pct?: number | null
          detected_at?: string
          expected?: number | null
          explanation?: string | null
          id?: string
          metric_type: Database["public"]["Enums"]["agentic_metric_type"]
          observed?: number | null
          severity?: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          channel_id?: string | null
          created_at?: string
          delta_pct?: number | null
          detected_at?: string
          expected?: number | null
          explanation?: string | null
          id?: string
          metric_type?: Database["public"]["Enums"]["agentic_metric_type"]
          observed?: number | null
          severity?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agentic_anomalies_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "agentic_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      agentic_channels: {
        Row: {
          created_at: string
          display_name: string
          handle: string | null
          id: string
          is_active: boolean
          platform: Database["public"]["Enums"]["agentic_platform"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          handle?: string | null
          id?: string
          is_active?: boolean
          platform: Database["public"]["Enums"]["agentic_platform"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          handle?: string | null
          id?: string
          is_active?: boolean
          platform?: Database["public"]["Enums"]["agentic_platform"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agentic_expenses: {
        Row: {
          amount: number
          category: string
          channel_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          occurred_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          channel_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          occurred_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          channel_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          occurred_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agentic_expenses_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "agentic_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      agentic_goals: {
        Row: {
          baseline_value: number
          channel_id: string | null
          created_at: string
          deadline: string
          id: string
          metric_type: Database["public"]["Enums"]["agentic_metric_type"]
          status: string
          target_value: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_value?: number
          channel_id?: string | null
          created_at?: string
          deadline: string
          id?: string
          metric_type: Database["public"]["Enums"]["agentic_metric_type"]
          status?: string
          target_value: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_value?: number
          channel_id?: string | null
          created_at?: string
          deadline?: string
          id?: string
          metric_type?: Database["public"]["Enums"]["agentic_metric_type"]
          status?: string
          target_value?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agentic_goals_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "agentic_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      agentic_metric_snapshots: {
        Row: {
          captured_at: string
          channel_id: string
          created_at: string
          engagement_rate: number | null
          followers: number | null
          id: string
          impressions: number | null
          notes: string | null
          posts_count: number | null
          raw_payload: Json | null
          reach: number | null
          source: Database["public"]["Enums"]["agentic_source"]
          total_views: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          channel_id: string
          created_at?: string
          engagement_rate?: number | null
          followers?: number | null
          id?: string
          impressions?: number | null
          notes?: string | null
          posts_count?: number | null
          raw_payload?: Json | null
          reach?: number | null
          source?: Database["public"]["Enums"]["agentic_source"]
          total_views?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          captured_at?: string
          channel_id?: string
          created_at?: string
          engagement_rate?: number | null
          followers?: number | null
          id?: string
          impressions?: number | null
          notes?: string | null
          posts_count?: number | null
          raw_payload?: Json | null
          reach?: number | null
          source?: Database["public"]["Enums"]["agentic_source"]
          total_views?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agentic_metric_snapshots_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "agentic_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      agentic_posts: {
        Row: {
          ad_spend_mmk: number
          channel_id: string
          comments: number
          created_at: string
          id: string
          likes: number
          notes: string | null
          post_url: string | null
          posted_at: string
          production_cost_mmk: number
          production_minutes: number
          reach: number
          saves: number
          shares: number
          source: Database["public"]["Enums"]["agentic_source"]
          title: string
          updated_at: string
          user_id: string
          views: number
        }
        Insert: {
          ad_spend_mmk?: number
          channel_id: string
          comments?: number
          created_at?: string
          id?: string
          likes?: number
          notes?: string | null
          post_url?: string | null
          posted_at?: string
          production_cost_mmk?: number
          production_minutes?: number
          reach?: number
          saves?: number
          shares?: number
          source?: Database["public"]["Enums"]["agentic_source"]
          title: string
          updated_at?: string
          user_id: string
          views?: number
        }
        Update: {
          ad_spend_mmk?: number
          channel_id?: string
          comments?: number
          created_at?: string
          id?: string
          likes?: number
          notes?: string | null
          post_url?: string | null
          posted_at?: string
          production_cost_mmk?: number
          production_minutes?: number
          reach?: number
          saves?: number
          shares?: number
          source?: Database["public"]["Enums"]["agentic_source"]
          title?: string
          updated_at?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "agentic_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "agentic_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      agentic_revenue: {
        Row: {
          amount: number
          channel_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          occurred_at: string
          related_post_id: string | null
          source: Database["public"]["Enums"]["agentic_revenue_source"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          channel_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          occurred_at?: string
          related_post_id?: string | null
          source: Database["public"]["Enums"]["agentic_revenue_source"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          channel_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          occurred_at?: string
          related_post_id?: string | null
          source?: Database["public"]["Enums"]["agentic_revenue_source"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agentic_revenue_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "agentic_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agentic_revenue_related_post_id_fkey"
            columns: ["related_post_id"]
            isOneToOne: false
            referencedRelation: "agentic_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      agentic_user_settings: {
        Row: {
          autonomy: Database["public"]["Enums"]["agentic_autonomy"]
          created_at: string
          default_currency: string
          hourly_rate_mmk: number
          onboarded: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          autonomy?: Database["public"]["Enums"]["agentic_autonomy"]
          created_at?: string
          default_currency?: string
          hourly_rate_mmk?: number
          onboarded?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          autonomy?: Database["public"]["Enums"]["agentic_autonomy"]
          created_at?: string
          default_currency?: string
          hourly_rate_mmk?: number
          onboarded?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_content_combinations: {
        Row: {
          created_at: string | null
          created_by: string | null
          display_order: number
          example: string | null
          full_example: string | null
          icon: string
          id: string
          is_active: boolean
          result: string
          result_myanmar: string | null
          style: string
          tone: string
          updated_at: string | null
          updated_by: string | null
          use_case: string
          use_case_myanmar: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          display_order?: number
          example?: string | null
          full_example?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          result: string
          result_myanmar?: string | null
          style: string
          tone: string
          updated_at?: string | null
          updated_by?: string | null
          use_case: string
          use_case_myanmar?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          display_order?: number
          example?: string | null
          full_example?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          result?: string
          result_myanmar?: string | null
          style?: string
          tone?: string
          updated_at?: string | null
          updated_by?: string | null
          use_case?: string
          use_case_myanmar?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_content_combinations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_content_combinations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_generated_content: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          embedding_error: string | null
          embedding_status: string | null
          embedding_synced_at: string | null
          id: string
          is_global: boolean | null
          is_personal: boolean | null
          is_template: boolean | null
          language: string | null
          last_used_at: string | null
          metadata: Json | null
          quality_score: number | null
          relevance_score: number | null
          search_metadata: Json | null
          source_type: string | null
          style: string | null
          tags: string[] | null
          title: string
          tone: string | null
          topic: string | null
          updated_at: string | null
          usage_count: number | null
          user_id: string
          web_search_used: boolean | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          embedding_error?: string | null
          embedding_status?: string | null
          embedding_synced_at?: string | null
          id?: string
          is_global?: boolean | null
          is_personal?: boolean | null
          is_template?: boolean | null
          language?: string | null
          last_used_at?: string | null
          metadata?: Json | null
          quality_score?: number | null
          relevance_score?: number | null
          search_metadata?: Json | null
          source_type?: string | null
          style?: string | null
          tags?: string[] | null
          title: string
          tone?: string | null
          topic?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
          web_search_used?: boolean | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          embedding_error?: string | null
          embedding_status?: string | null
          embedding_synced_at?: string | null
          id?: string
          is_global?: boolean | null
          is_personal?: boolean | null
          is_template?: boolean | null
          language?: string | null
          last_used_at?: string | null
          metadata?: Json | null
          quality_score?: number | null
          relevance_score?: number | null
          search_metadata?: Json | null
          source_type?: string | null
          style?: string | null
          tags?: string[] | null
          title?: string
          tone?: string | null
          topic?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
          web_search_used?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generated_content_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_model_settings: {
        Row: {
          allow_gateway_fallback_content: boolean | null
          allow_personal_api_key: boolean | null
          anthropic_system_api_key: string | null
          auto_sync_enabled: boolean | null
          bypass_iu_for_personal_key: boolean | null
          default_claude_model: string | null
          default_gemini_model: string | null
          enable_anthropic_provider: boolean | null
          enable_free_tier: boolean | null
          enable_google_provider: boolean | null
          enabled_gemini_models: string[] | null
          google_system_api_key: string | null
          id: string
          require_personal_key: boolean | null
          selected_model: string
          system_api_key: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          allow_gateway_fallback_content?: boolean | null
          allow_personal_api_key?: boolean | null
          anthropic_system_api_key?: string | null
          auto_sync_enabled?: boolean | null
          bypass_iu_for_personal_key?: boolean | null
          default_claude_model?: string | null
          default_gemini_model?: string | null
          enable_anthropic_provider?: boolean | null
          enable_free_tier?: boolean | null
          enable_google_provider?: boolean | null
          enabled_gemini_models?: string[] | null
          google_system_api_key?: string | null
          id?: string
          require_personal_key?: boolean | null
          selected_model?: string
          system_api_key?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          allow_gateway_fallback_content?: boolean | null
          allow_personal_api_key?: boolean | null
          anthropic_system_api_key?: string | null
          auto_sync_enabled?: boolean | null
          bypass_iu_for_personal_key?: boolean | null
          default_claude_model?: string | null
          default_gemini_model?: string | null
          enable_anthropic_provider?: boolean | null
          enable_free_tier?: boolean | null
          enable_google_provider?: boolean | null
          enabled_gemini_models?: string[] | null
          google_system_api_key?: string | null
          id?: string
          require_personal_key?: boolean | null
          selected_model?: string
          system_api_key?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_model_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_subsystem_overrides: {
        Row: {
          api_key: string | null
          created_at: string
          enabled: boolean
          id: string
          model: string
          provider: string
          subsystem: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          model: string
          provider: string
          subsystem: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          model?: string
          provider?: string
          subsystem?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_user_settings: {
        Row: {
          allow_gateway_access: boolean | null
          created_at: string | null
          disabled_connectors: Json | null
          gemini_api_key: string | null
          gemini_model: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_paused: boolean | null
          is_premium: boolean | null
          last_generation_at: string | null
          notes: string | null
          notion_api_key: string | null
          notion_workspace_name: string | null
          personal_anthropic_key: string | null
          prefer_personal_key: boolean | null
          total_generations: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allow_gateway_access?: boolean | null
          created_at?: string | null
          disabled_connectors?: Json | null
          gemini_api_key?: string | null
          gemini_model?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_paused?: boolean | null
          is_premium?: boolean | null
          last_generation_at?: string | null
          notes?: string | null
          notion_api_key?: string | null
          notion_workspace_name?: string | null
          personal_anthropic_key?: string | null
          prefer_personal_key?: boolean | null
          total_generations?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allow_gateway_access?: boolean | null
          created_at?: string | null
          disabled_connectors?: Json | null
          gemini_api_key?: string | null
          gemini_model?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_paused?: boolean | null
          is_premium?: boolean | null
          last_generation_at?: string | null
          notes?: string | null
          notion_api_key?: string | null
          notion_workspace_name?: string | null
          personal_anthropic_key?: string | null
          prefer_personal_key?: boolean | null
          total_generations?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auth_settings: {
        Row: {
          block_disposable_emails: boolean
          email_auth_enabled: boolean
          google_auth_enabled: boolean
          id: string
          lockout_duration_minutes: number
          max_login_attempts: number
          rate_limit_enabled: boolean
          require_email_verification: boolean
          signin_enabled: boolean
          signup_enabled: boolean
          unverified_cleanup_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          block_disposable_emails?: boolean
          email_auth_enabled?: boolean
          google_auth_enabled?: boolean
          id?: string
          lockout_duration_minutes?: number
          max_login_attempts?: number
          rate_limit_enabled?: boolean
          require_email_verification?: boolean
          signin_enabled?: boolean
          signup_enabled?: boolean
          unverified_cleanup_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          block_disposable_emails?: boolean
          email_auth_enabled?: boolean
          google_auth_enabled?: boolean
          id?: string
          lockout_duration_minutes?: number
          max_login_attempts?: number
          rate_limit_enabled?: boolean
          require_email_verification?: boolean
          signin_enabled?: boolean
          signup_enabled?: boolean
          unverified_cleanup_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      autonomous_task_steps: {
        Row: {
          agent_role: string
          completed_at: string | null
          created_at: string | null
          depends_on: string[] | null
          description: string | null
          error: string | null
          id: string
          metadata: Json | null
          result: string | null
          retries: number | null
          started_at: string | null
          status: string
          step_index: number
          task_id: string
          title: string
          tool: string | null
        }
        Insert: {
          agent_role?: string
          completed_at?: string | null
          created_at?: string | null
          depends_on?: string[] | null
          description?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          result?: string | null
          retries?: number | null
          started_at?: string | null
          status?: string
          step_index: number
          task_id: string
          title: string
          tool?: string | null
        }
        Update: {
          agent_role?: string
          completed_at?: string | null
          created_at?: string | null
          depends_on?: string[] | null
          description?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          result?: string | null
          retries?: number | null
          started_at?: string | null
          status?: string
          step_index?: number
          task_id?: string
          title?: string
          tool?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autonomous_task_steps_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "autonomous_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomous_tasks: {
        Row: {
          agent_roles_used: string[] | null
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          error: string | null
          execution_mode: string | null
          id: string
          max_parallelism: number | null
          metadata: Json | null
          original_prompt: string
          plan: Json | null
          progress_pct: number | null
          result: string | null
          session_id: string | null
          status: string
          total_steps: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_roles_used?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          error?: string | null
          execution_mode?: string | null
          id?: string
          max_parallelism?: number | null
          metadata?: Json | null
          original_prompt: string
          plan?: Json | null
          progress_pct?: number | null
          result?: string | null
          session_id?: string | null
          status?: string
          total_steps?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_roles_used?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          error?: string | null
          execution_mode?: string | null
          id?: string
          max_parallelism?: number | null
          metadata?: Json | null
          original_prompt?: string
          plan?: Json | null
          progress_pct?: number | null
          result?: string | null
          session_id?: string | null
          status?: string
          total_steps?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomous_tasks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      beebot_entities: {
        Row: {
          attrs: Json
          canonical_key: string
          created_at: string
          description: string | null
          embedding: string | null
          entity_type: string
          id: string
          importance: number
          last_mentioned_at: string
          mention_count: number
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attrs?: Json
          canonical_key: string
          created_at?: string
          description?: string | null
          embedding?: string | null
          entity_type: string
          id?: string
          importance?: number
          last_mentioned_at?: string
          mention_count?: number
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attrs?: Json
          canonical_key?: string
          created_at?: string
          description?: string | null
          embedding?: string | null
          entity_type?: string
          id?: string
          importance?: number
          last_mentioned_at?: string
          mention_count?: number
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beebot_lessons: {
        Row: {
          applied_count: number
          category: string | null
          confidence: number
          created_at: string
          embedding: string | null
          evidence_trajectory_ids: string[] | null
          helpful_count: number
          id: string
          is_active: boolean
          lesson_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_count?: number
          category?: string | null
          confidence?: number
          created_at?: string
          embedding?: string | null
          evidence_trajectory_ids?: string[] | null
          helpful_count?: number
          id?: string
          is_active?: boolean
          lesson_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_count?: number
          category?: string | null
          confidence?: number
          created_at?: string
          embedding?: string | null
          evidence_trajectory_ids?: string[] | null
          helpful_count?: number
          id?: string
          is_active?: boolean
          lesson_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beebot_proactive_triggers: {
        Row: {
          action_prompt: string
          condition: Json | null
          created_at: string
          description: string | null
          failure_count: number
          fire_count: number
          id: string
          is_active: boolean
          last_fired_at: string | null
          name: string
          next_fire_at: string | null
          schedule_cron: string | null
          schedule_tz: string
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_prompt: string
          condition?: Json | null
          created_at?: string
          description?: string | null
          failure_count?: number
          fire_count?: number
          id?: string
          is_active?: boolean
          last_fired_at?: string | null
          name: string
          next_fire_at?: string | null
          schedule_cron?: string | null
          schedule_tz?: string
          trigger_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_prompt?: string
          condition?: Json | null
          created_at?: string
          description?: string | null
          failure_count?: number
          fire_count?: number
          id?: string
          is_active?: boolean
          last_fired_at?: string | null
          name?: string
          next_fire_at?: string | null
          schedule_cron?: string | null
          schedule_tz?: string
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beebot_relations: {
        Row: {
          created_at: string
          evidence: Json | null
          from_entity: string
          id: string
          last_observed_at: string
          observed_count: number
          relation_type: string
          strength: number
          to_entity: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence?: Json | null
          from_entity: string
          id?: string
          last_observed_at?: string
          observed_count?: number
          relation_type: string
          strength?: number
          to_entity: string
          user_id: string
        }
        Update: {
          created_at?: string
          evidence?: Json | null
          from_entity?: string
          id?: string
          last_observed_at?: string
          observed_count?: number
          relation_type?: string
          strength?: number
          to_entity?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beebot_relations_from_entity_fkey"
            columns: ["from_entity"]
            isOneToOne: false
            referencedRelation: "beebot_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beebot_relations_to_entity_fkey"
            columns: ["to_entity"]
            isOneToOne: false
            referencedRelation: "beebot_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      beebot_trajectories: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          embedding: string | null
          error_text: string | null
          goal_id: string | null
          id: string
          metadata: Json | null
          outcome: string
          outcome_summary: string | null
          source: string
          started_at: string
          step_count: number | null
          steps_taken: Json
          task_summary: string
          tools_used: string[] | null
          trigger_id: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          embedding?: string | null
          error_text?: string | null
          goal_id?: string | null
          id?: string
          metadata?: Json | null
          outcome?: string
          outcome_summary?: string | null
          source?: string
          started_at?: string
          step_count?: number | null
          steps_taken?: Json
          task_summary: string
          tools_used?: string[] | null
          trigger_id?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          embedding?: string | null
          error_text?: string | null
          goal_id?: string | null
          id?: string
          metadata?: Json | null
          outcome?: string
          outcome_summary?: string | null
          source?: string
          started_at?: string
          step_count?: number | null
          steps_taken?: Json
          task_summary?: string
          tools_used?: string[] | null
          trigger_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bot_chat_logs: {
        Row: {
          ai_reply: string | null
          bot_id: string | null
          chat_id: string | null
          created_at: string | null
          id: string
          image_file_id: string | null
          message: string
          message_type: string | null
          telegram_user_id: string
          telegram_username: string | null
          user_id: string
        }
        Insert: {
          ai_reply?: string | null
          bot_id?: string | null
          chat_id?: string | null
          created_at?: string | null
          id?: string
          image_file_id?: string | null
          message: string
          message_type?: string | null
          telegram_user_id: string
          telegram_username?: string | null
          user_id: string
        }
        Update: {
          ai_reply?: string | null
          bot_id?: string | null
          chat_id?: string | null
          created_at?: string | null
          id?: string
          image_file_id?: string | null
          message?: string
          message_type?: string | null
          telegram_user_id?: string
          telegram_username?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_chat_logs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bot_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_settings: {
        Row: {
          allow_dm: boolean | null
          bot_type: string
          bot_username: string | null
          created_at: string | null
          description: string | null
          gemini_api_key: string | null
          gemini_model: string | null
          group_bot_active: boolean | null
          group_bot_allow_dm: boolean | null
          group_bot_allow_web_search: boolean | null
          group_bot_custom_instruction: string | null
          group_bot_name: string | null
          group_bot_token: string | null
          group_bot_username: string | null
          id: string
          is_active: boolean | null
          last_activity_at: string | null
          last_error_at: string | null
          last_error_message: string | null
          message_count_24h: number | null
          name: string | null
          system_prompt: string | null
          telegram_bot_token: string | null
          trigger_word: string | null
          updated_at: string | null
          use_shared_key: boolean | null
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          allow_dm?: boolean | null
          bot_type?: string
          bot_username?: string | null
          created_at?: string | null
          description?: string | null
          gemini_api_key?: string | null
          gemini_model?: string | null
          group_bot_active?: boolean | null
          group_bot_allow_dm?: boolean | null
          group_bot_allow_web_search?: boolean | null
          group_bot_custom_instruction?: string | null
          group_bot_name?: string | null
          group_bot_token?: string | null
          group_bot_username?: string | null
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          last_error_at?: string | null
          last_error_message?: string | null
          message_count_24h?: number | null
          name?: string | null
          system_prompt?: string | null
          telegram_bot_token?: string | null
          trigger_word?: string | null
          updated_at?: string | null
          use_shared_key?: boolean | null
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          allow_dm?: boolean | null
          bot_type?: string
          bot_username?: string | null
          created_at?: string | null
          description?: string | null
          gemini_api_key?: string | null
          gemini_model?: string | null
          group_bot_active?: boolean | null
          group_bot_allow_dm?: boolean | null
          group_bot_allow_web_search?: boolean | null
          group_bot_custom_instruction?: string | null
          group_bot_name?: string | null
          group_bot_token?: string | null
          group_bot_username?: string | null
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          last_error_at?: string | null
          last_error_message?: string | null
          message_count_24h?: number | null
          name?: string | null
          system_prompt?: string | null
          telegram_bot_token?: string | null
          trigger_word?: string | null
          updated_at?: string | null
          use_shared_key?: boolean | null
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      broadcast_channels: {
        Row: {
          bot_settings_id: string | null
          bot_token: string | null
          bot_username: string | null
          channel_id: string
          channel_name: string
          channel_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bot_settings_id?: string | null
          bot_token?: string | null
          bot_username?: string | null
          channel_id: string
          channel_name: string
          channel_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bot_settings_id?: string | null
          bot_token?: string | null
          bot_username?: string | null
          channel_id?: string
          channel_name?: string
          channel_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_channels_bot_settings_id_fkey"
            columns: ["bot_settings_id"]
            isOneToOne: false
            referencedRelation: "bot_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          campaign_url: string
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          campaign_url: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          campaign_url?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      certificates: {
        Row: {
          certificate_data: Json
          course_id: string
          id: string
          issued_at: string | null
          user_id: string
        }
        Insert: {
          certificate_data: Json
          course_id: string
          id?: string
          issued_at?: string | null
          user_id: string
        }
        Update: {
          certificate_data?: Json
          course_id?: string
          id?: string
          issued_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_identities: {
        Row: {
          channel: string
          chat_id: string | null
          created_at: string
          external_id: string
          external_username: string | null
          id: string
          is_primary: boolean
          is_verified: boolean
          linked_at: string
          metadata: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          chat_id?: string | null
          created_at?: string
          external_id: string
          external_username?: string | null
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          linked_at?: string
          metadata?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          chat_id?: string | null
          created_at?: string
          external_id?: string
          external_username?: string | null
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          linked_at?: string
          metadata?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      channel_link_codes: {
        Row: {
          channel: string
          chat_id: string | null
          code: string
          created_at: string
          expires_at: string
          external_id: string
          external_username: string | null
          id: string
          is_used: boolean
          user_id: string
        }
        Insert: {
          channel?: string
          chat_id?: string | null
          code: string
          created_at?: string
          expires_at?: string
          external_id: string
          external_username?: string | null
          id?: string
          is_used?: boolean
          user_id: string
        }
        Update: {
          channel?: string
          chat_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          external_id?: string
          external_username?: string | null
          id?: string
          is_used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      chat_memory_embeddings: {
        Row: {
          content_summary: string
          created_at: string | null
          embedding: string
          fts: unknown
          id: string
          importance_score: number | null
          message_id: string | null
          scope: string
          scope_key: string | null
          session_id: string
          source_platform: string | null
          topic_tags: string[] | null
          user_id: string
        }
        Insert: {
          content_summary: string
          created_at?: string | null
          embedding: string
          fts?: unknown
          id?: string
          importance_score?: number | null
          message_id?: string | null
          scope?: string
          scope_key?: string | null
          session_id: string
          source_platform?: string | null
          topic_tags?: string[] | null
          user_id: string
        }
        Update: {
          content_summary?: string
          created_at?: string | null
          embedding?: string
          fts?: unknown
          id?: string
          importance_score?: number | null
          message_id?: string | null
          scope?: string
          scope_key?: string | null
          session_id?: string
          source_platform?: string | null
          topic_tags?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_memory_embeddings_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_memory_embeddings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usage: {
        Row: {
          coupon_id: string | null
          enrollment_id: string | null
          id: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          coupon_id?: string | null
          enrollment_id?: string | null
          id?: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          coupon_id?: string | null
          enrollment_id?: string | null
          id?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          access_duration_days: number | null
          applicable_course_ids: string[] | null
          code: string
          created_at: string | null
          created_by: string | null
          current_uses: number | null
          discount_percentage: number
          id: string
          is_active: boolean | null
          max_uses: number
          updated_at: string | null
          valid_from: string | null
          valid_until: string
        }
        Insert: {
          access_duration_days?: number | null
          applicable_course_ids?: string[] | null
          code: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          discount_percentage: number
          id?: string
          is_active?: boolean | null
          max_uses: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until: string
        }
        Update: {
          access_duration_days?: number | null
          applicable_course_ids?: string[] | null
          code?: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          discount_percentage?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string
        }
        Relationships: []
      }
      course_engagements: {
        Row: {
          course_id: string
          engaged_at: string | null
          engagement_type: string
          id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          course_id: string
          engaged_at?: string | null
          engagement_type: string
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          course_id?: string
          engaged_at?: string | null
          engagement_type?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_engagements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_engagements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      course_views: {
        Row: {
          course_id: string
          id: string
          session_id: string | null
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          course_id: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          course_id?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_views_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      courses: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          difficulty: string | null
          id: string
          instructor_name: string | null
          is_free: boolean | null
          is_published: boolean | null
          price: number | null
          rejection_reason: string | null
          slug: string
          thumbnail_url: string | null
          title: string
          total_duration_minutes: number | null
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          id?: string
          instructor_name?: string | null
          is_free?: boolean | null
          is_published?: boolean | null
          price?: number | null
          rejection_reason?: string | null
          slug: string
          thumbnail_url?: string | null
          title: string
          total_duration_minutes?: number | null
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          id?: string
          instructor_name?: string | null
          is_free?: boolean | null
          is_published?: boolean | null
          price?: number | null
          rejection_reason?: string | null
          slug?: string
          thumbnail_url?: string | null
          title?: string
          total_duration_minutes?: number | null
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      cr_blueprint_components: {
        Row: {
          component_key: string
          component_name: string
          component_name_mm: string | null
          created_at: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          order_index: number | null
          pillar: string
        }
        Insert: {
          component_key: string
          component_name: string
          component_name_mm?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          order_index?: number | null
          pillar: string
        }
        Update: {
          component_key?: string
          component_name?: string
          component_name_mm?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          order_index?: number | null
          pillar?: string
        }
        Relationships: []
      }
      cr_premium_responses: {
        Row: {
          component_key: string
          content: Json
          created_at: string | null
          id: string
          response_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          component_key: string
          content: Json
          created_at?: string | null
          id?: string
          response_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          component_key?: string
          content?: Json
          created_at?: string | null
          id?: string
          response_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cr_premium_responses_component_key_fkey"
            columns: ["component_key"]
            isOneToOne: false
            referencedRelation: "cr_blueprint_components"
            referencedColumns: ["component_key"]
          },
          {
            foreignKeyName: "cr_premium_responses_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "cr_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      cr_questions: {
        Row: {
          category: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          options: Json | null
          order_index: number
          question_text: string
          question_type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          options?: Json | null
          order_index?: number
          question_text: string
          question_type?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          options?: Json | null
          order_index?: number
          question_text?: string
          question_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      cr_responses: {
        Row: {
          answers: Json
          archetype: string | null
          archetype_description: string | null
          completed_at: string | null
          created_at: string
          generation_lock_expires_at: string | null
          generation_lock_id: string | null
          generation_locked_at: string | null
          id: string
          is_public: boolean | null
          processing_status: string
          result_en: Json | null
          result_my: Json | null
          share_uid: string | null
          shared_at: string | null
          stats: Json | null
          strategy: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          archetype?: string | null
          archetype_description?: string | null
          completed_at?: string | null
          created_at?: string
          generation_lock_expires_at?: string | null
          generation_lock_id?: string | null
          generation_locked_at?: string | null
          id?: string
          is_public?: boolean | null
          processing_status?: string
          result_en?: Json | null
          result_my?: Json | null
          share_uid?: string | null
          shared_at?: string | null
          stats?: Json | null
          strategy?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          archetype?: string | null
          archetype_description?: string | null
          completed_at?: string | null
          created_at?: string
          generation_lock_expires_at?: string | null
          generation_lock_id?: string | null
          generation_locked_at?: string | null
          id?: string
          is_public?: boolean | null
          processing_status?: string
          result_en?: Json | null
          result_my?: Json | null
          share_uid?: string | null
          shared_at?: string | null
          stats?: Json | null
          strategy?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cr_user_usage: {
        Row: {
          allow_gateway_fallback: boolean | null
          attempts_remaining: number
          created_at: string
          gemini_api_key: string | null
          gemini_model: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_premium: boolean
          last_attempt_at: string | null
          premium_access_until: string | null
          subscription_tier: string | null
          total_attempts_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_gateway_fallback?: boolean | null
          attempts_remaining?: number
          created_at?: string
          gemini_api_key?: string | null
          gemini_model?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_premium?: boolean
          last_attempt_at?: string | null
          premium_access_until?: string | null
          subscription_tier?: string | null
          total_attempts_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_gateway_fallback?: boolean | null
          attempts_remaining?: number
          created_at?: string
          gemini_api_key?: string | null
          gemini_model?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_premium?: boolean
          last_attempt_at?: string | null
          premium_access_until?: string | null
          subscription_tier?: string | null
          total_attempts_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_applications: {
        Row: {
          admin_notes: string | null
          bio: string | null
          created_at: string | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          other_links: string | null
          portfolio_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          telegram_url: string | null
          tiktok_url: string | null
          twitter_url: string | null
          updated_at: string | null
          user_id: string
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          admin_notes?: string | null
          bio?: string | null
          created_at?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          other_links?: string | null
          portfolio_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          telegram_url?: string | null
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          user_id: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          admin_notes?: string | null
          bio?: string | null
          created_at?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          other_links?: string | null
          portfolio_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          telegram_url?: string | null
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          user_id?: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      creator_permissions: {
        Row: {
          can_create_courses: boolean
          created_at: string | null
          id: string
          is_suspended: boolean
          max_courses: number | null
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_create_courses?: boolean
          created_at?: string | null
          id?: string
          is_suspended?: boolean
          max_courses?: number | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_create_courses?: boolean
          created_at?: string | null
          id?: string
          is_suspended?: boolean
          max_courses?: number | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_orders: {
        Row: {
          amount_paid: number
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          credits_purchased: number
          id: string
          payment_method_id: string | null
          payment_notes: string | null
          payment_receipt_url: string | null
          plan_id: string
          rejected_at: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_paid: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          credits_purchased: number
          id?: string
          payment_method_id?: string | null
          payment_notes?: string | null
          payment_receipt_url?: string | null
          plan_id: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          credits_purchased?: number
          id?: string
          payment_method_id?: string | null
          payment_notes?: string | null
          payment_receipt_url?: string | null
          plan_id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_orders_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "credit_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_plans: {
        Row: {
          created_at: string | null
          created_by: string | null
          credits: number
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          max_members_per_workspace: number | null
          max_workspaces: number | null
          name: string
          price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          credits: number
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          max_members_per_workspace?: number | null
          max_workspaces?: number | null
          name: string
          price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          credits?: number
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          max_members_per_workspace?: number | null
          max_workspaces?: number | null
          name?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          balance_after: number
          created_at: string | null
          credits: number
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string | null
          credits: number
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string | null
          credits?: number
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      curator_decisions: {
        Row: {
          candidate_category: string | null
          candidate_content: string
          created_at: string
          curator_score: number | null
          decision: string
          id: string
          matched_memory_id: string | null
          reason: string | null
          source_session_id: string | null
          user_id: string
        }
        Insert: {
          candidate_category?: string | null
          candidate_content: string
          created_at?: string
          curator_score?: number | null
          decision: string
          id?: string
          matched_memory_id?: string | null
          reason?: string | null
          source_session_id?: string | null
          user_id: string
        }
        Update: {
          candidate_category?: string | null
          candidate_content?: string
          created_at?: string
          curator_score?: number | null
          decision?: string
          id?: string
          matched_memory_id?: string | null
          reason?: string | null
          source_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      currency_exchange_rates: {
        Row: {
          base_currency: string
          id: string
          rate: number
          target_currency: string
          updated_at: string | null
        }
        Insert: {
          base_currency: string
          id?: string
          rate: number
          target_currency: string
          updated_at?: string | null
        }
        Update: {
          base_currency?: string
          id?: string
          rate?: number
          target_currency?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_usage: {
        Row: {
          ai_content_uses: number | null
          beebot_uses: number | null
          created_at: string | null
          creator_rocket_uses: number | null
          daily_limit: number | null
          easy_srt_uses: number | null
          flowstate_uses: number | null
          id: string
          iu_consumed: number | null
          model_used: string | null
          provider_used: string | null
          tokens_input: number | null
          tokens_output: number | null
          total_uses: number | null
          updated_at: string | null
          usage_date: string
          user_id: string
          workspace_uses: number | null
        }
        Insert: {
          ai_content_uses?: number | null
          beebot_uses?: number | null
          created_at?: string | null
          creator_rocket_uses?: number | null
          daily_limit?: number | null
          easy_srt_uses?: number | null
          flowstate_uses?: number | null
          id?: string
          iu_consumed?: number | null
          model_used?: string | null
          provider_used?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          total_uses?: number | null
          updated_at?: string | null
          usage_date?: string
          user_id: string
          workspace_uses?: number | null
        }
        Update: {
          ai_content_uses?: number | null
          beebot_uses?: number | null
          created_at?: string | null
          creator_rocket_uses?: number | null
          daily_limit?: number | null
          easy_srt_uses?: number | null
          flowstate_uses?: number | null
          id?: string
          iu_consumed?: number | null
          model_used?: string | null
          provider_used?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          total_uses?: number | null
          updated_at?: string | null
          usage_date?: string
          user_id?: string
          workspace_uses?: number | null
        }
        Relationships: []
      }
      delivery_retry_queue: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json
          status: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          channel: string
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload: Json
          status?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      doctor_reports: {
        Row: {
          created_at: string
          diagnosis: Json
          error_count: number
          id: string
          status: string
          trigger_type: string
        }
        Insert: {
          created_at?: string
          diagnosis?: Json
          error_count?: number
          id?: string
          status?: string
          trigger_type?: string
        }
        Update: {
          created_at?: string
          diagnosis?: Json
          error_count?: number
          id?: string
          status?: string
          trigger_type?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          access_duration_days: number | null
          access_expires_at: string | null
          coupon_id: string | null
          course_id: string
          created_at: string | null
          discount_applied: number | null
          final_price: number | null
          id: string
          is_expired: boolean | null
          payment_method_id: string | null
          payment_notes: string | null
          payment_receipt_url: string | null
          payment_submitted_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_duration_days?: number | null
          access_expires_at?: string | null
          coupon_id?: string | null
          course_id: string
          created_at?: string | null
          discount_applied?: number | null
          final_price?: number | null
          id?: string
          is_expired?: boolean | null
          payment_method_id?: string | null
          payment_notes?: string | null
          payment_receipt_url?: string | null
          payment_submitted_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_duration_days?: number | null
          access_expires_at?: string | null
          coupon_id?: string | null
          course_id?: string
          created_at?: string | null
          discount_applied?: number | null
          final_price?: number | null
          id?: string
          is_expired?: boolean | null
          payment_method_id?: string | null
          payment_notes?: string | null
          payment_receipt_url?: string | null
          payment_submitted_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      expiry_notifications: {
        Row: {
          days_before: number
          enrollment_id: string
          id: string
          sent_at: string | null
        }
        Insert: {
          days_before: number
          enrollment_id: string
          id?: string
          sent_at?: string | null
        }
        Update: {
          days_before?: number
          enrollment_id?: string
          id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expiry_notifications_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_pages: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          page_access_token: string | null
          page_id: string
          page_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          page_access_token?: string | null
          page_id: string
          page_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          page_access_token?: string | null
          page_id?: string
          page_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          category: string | null
          description: string | null
          description_my: string | null
          disabled_at: string | null
          disabled_by: string | null
          enabled_at: string | null
          feature_key: string
          feature_name: string
          feature_name_my: string | null
          icon: string | null
          id: string
          is_enabled: boolean | null
          maintenance_message: string | null
          maintenance_message_my: string | null
          parent_feature_key: string | null
          show_in_nav: boolean | null
          show_on_dashboard: boolean
          sort_order: number | null
          status: string
          status_message: string | null
          status_message_my: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          description?: string | null
          description_my?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          enabled_at?: string | null
          feature_key: string
          feature_name: string
          feature_name_my?: string | null
          icon?: string | null
          id?: string
          is_enabled?: boolean | null
          maintenance_message?: string | null
          maintenance_message_my?: string | null
          parent_feature_key?: string | null
          show_in_nav?: boolean | null
          show_on_dashboard?: boolean
          sort_order?: number | null
          status?: string
          status_message?: string | null
          status_message_my?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          description?: string | null
          description_my?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          enabled_at?: string | null
          feature_key?: string
          feature_name?: string
          feature_name_my?: string | null
          icon?: string | null
          id?: string
          is_enabled?: boolean | null
          maintenance_message?: string | null
          maintenance_message_my?: string | null
          parent_feature_key?: string | null
          show_in_nav?: boolean | null
          show_on_dashboard?: boolean
          sort_order?: number | null
          status?: string
          status_message?: string | null
          status_message_my?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_parent_fkey"
            columns: ["parent_feature_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["feature_key"]
          },
        ]
      }
      feedback_discussions: {
        Row: {
          attachments: Json | null
          author_id: string | null
          author_type: string
          content: string
          created_at: string | null
          feedback_id: string
          id: string
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          author_type: string
          content: string
          created_at?: string | null
          feedback_id: string
          id?: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          author_type?: string
          content?: string
          created_at?: string | null
          feedback_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_discussions_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "user_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_insights: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          affected_feedbacks: string[] | null
          category: string | null
          created_at: string | null
          id: string
          insight_data: Json
          insight_type: string
          is_actioned: boolean | null
          priority: string | null
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          affected_feedbacks?: string[] | null
          category?: string | null
          created_at?: string | null
          id?: string
          insight_data: Json
          insight_type: string
          is_actioned?: boolean | null
          priority?: string | null
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          affected_feedbacks?: string[] | null
          category?: string | null
          created_at?: string | null
          id?: string
          insight_data?: Json
          insight_type?: string
          is_actioned?: boolean | null
          priority?: string | null
        }
        Relationships: []
      }
      financial_accounts: {
        Row: {
          account_name: string
          account_type: string
          color: string | null
          created_at: string | null
          currency: string
          current_balance: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_name: string
          account_type?: string
          color?: string | null
          created_at?: string | null
          currency?: string
          current_balance?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_name?: string
          account_type?: string
          color?: string | null
          created_at?: string | null
          currency?: string
          current_balance?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      flowstate_settings: {
        Row: {
          created_at: string | null
          display_currencies: string[] | null
          id: string
          monthly_budget: number | null
          primary_currency: string | null
          show_balance_on_dashboard: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          display_currencies?: string[] | null
          id?: string
          monthly_budget?: number | null
          primary_currency?: string | null
          show_balance_on_dashboard?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          display_currencies?: string[] | null
          id?: string
          monthly_budget?: number | null
          primary_currency?: string | null
          show_balance_on_dashboard?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      group_bots: {
        Row: {
          allow_dm: boolean | null
          allow_web_search: boolean | null
          bot_name: string | null
          bot_settings_id: string | null
          bot_token: string | null
          bot_username: string | null
          created_at: string | null
          custom_instruction: string | null
          id: string
          is_active: boolean | null
          name: string | null
          trigger_word: string | null
          updated_at: string | null
          user_id: string
          webhook_active: boolean | null
        }
        Insert: {
          allow_dm?: boolean | null
          allow_web_search?: boolean | null
          bot_name?: string | null
          bot_settings_id?: string | null
          bot_token?: string | null
          bot_username?: string | null
          created_at?: string | null
          custom_instruction?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          trigger_word?: string | null
          updated_at?: string | null
          user_id: string
          webhook_active?: boolean | null
        }
        Update: {
          allow_dm?: boolean | null
          allow_web_search?: boolean | null
          bot_name?: string | null
          bot_settings_id?: string | null
          bot_token?: string | null
          bot_username?: string | null
          created_at?: string | null
          custom_instruction?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          trigger_word?: string | null
          updated_at?: string | null
          user_id?: string
          webhook_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "group_bots_bot_settings_id_fkey"
            columns: ["bot_settings_id"]
            isOneToOne: false
            referencedRelation: "bot_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      iu_transactions: {
        Row: {
          balance_after: number | null
          created_at: string | null
          description: string | null
          feature_key: string | null
          id: string
          iu_amount: number
          metadata: Json | null
          model_used: string | null
          provider_used: string | null
          request_id: string | null
          source_pool: string | null
          tokens_processed: number | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string | null
          description?: string | null
          feature_key?: string | null
          id?: string
          iu_amount: number
          metadata?: Json | null
          model_used?: string | null
          provider_used?: string | null
          request_id?: string | null
          source_pool?: string | null
          tokens_processed?: number | null
          transaction_type: string
          user_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string | null
          description?: string | null
          feature_key?: string | null
          id?: string
          iu_amount?: number
          metadata?: Json | null
          model_used?: string | null
          provider_used?: string | null
          request_id?: string | null
          source_pool?: string | null
          tokens_processed?: number | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      kb_embedding_sync_queue: {
        Row: {
          action: string
          content_id: string
          created_at: string | null
          error_message: string | null
          id: string
          processed_at: string | null
          status: string | null
        }
        Insert: {
          action: string
          content_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          status?: string | null
        }
        Update: {
          action?: string
          content_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_embedding_sync_queue_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: true
            referencedRelation: "ai_generated_content"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_embeddings: {
        Row: {
          chunk_index: number | null
          content_chunk: string
          content_id: string
          embedding: string
          id: string
          synced_at: string | null
        }
        Insert: {
          chunk_index?: number | null
          content_chunk: string
          content_id: string
          embedding: string
          id?: string
          synced_at?: string | null
        }
        Update: {
          chunk_index?: number | null
          content_chunk?: string
          content_id?: string
          embedding?: string
          id?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_embeddings_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "ai_generated_content"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_streaks: {
        Row: {
          activity_count: number | null
          created_at: string | null
          id: string
          streak_date: string
          user_id: string
        }
        Insert: {
          activity_count?: number | null
          created_at?: string | null
          id?: string
          streak_date: string
          user_id: string
        }
        Update: {
          activity_count?: number | null
          created_at?: string | null
          id?: string
          streak_date?: string
          user_id?: string
        }
        Relationships: []
      }
      lesson_sections: {
        Row: {
          course_id: string
          created_at: string | null
          description: string | null
          id: string
          order_index: number
          title: string
          updated_at: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          course_id: string
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_locked: boolean | null
          is_premium: boolean | null
          is_private: boolean | null
          is_published: boolean | null
          lesson_type: string | null
          mux_asset_id: string | null
          mux_playback_id: string | null
          order_index: number | null
          section: string | null
          section_id: string | null
          slug: string
          text_content: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          video_platform: string | null
          vimeo_url: string | null
          youtube_url: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_locked?: boolean | null
          is_premium?: boolean | null
          is_private?: boolean | null
          is_published?: boolean | null
          lesson_type?: string | null
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          order_index?: number | null
          section?: string | null
          section_id?: string | null
          slug: string
          text_content?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          video_platform?: string | null
          vimeo_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_locked?: boolean | null
          is_premium?: boolean | null
          is_private?: boolean | null
          is_published?: boolean | null
          lesson_type?: string | null
          mux_asset_id?: string | null
          mux_playback_id?: string | null
          order_index?: number | null
          section?: string | null
          section_id?: string | null
          slug?: string
          text_content?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          video_platform?: string | null
          vimeo_url?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "lesson_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempt_time: string
          attempt_type: string
          email: string
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          attempt_time?: string
          attempt_type?: string
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          attempt_time?: string
          attempt_type?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      memory_queue: {
        Row: {
          created_at: string | null
          id: string
          locked_until: string | null
          payload: Json
          processed_at: string | null
          retry_count: number | null
          session_id: string
          status: string
          task_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          locked_until?: string | null
          payload?: Json
          processed_at?: string | null
          retry_count?: number | null
          session_id: string
          status?: string
          task_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          locked_until?: string | null
          payload?: Json
          processed_at?: string | null
          retry_count?: number | null
          session_id?: string
          status?: string
          task_type?: string
          user_id?: string
        }
        Relationships: []
      }
      model_cost_matrix: {
        Row: {
          base_iu_per_request: number | null
          created_at: string | null
          id: string
          is_available: boolean | null
          is_new: boolean | null
          iu_per_1k_input: number | null
          iu_per_1k_output: number | null
          min_tier_level: number | null
          model_display_name: string
          model_display_name_mm: string | null
          model_id: string
          provider: string
        }
        Insert: {
          base_iu_per_request?: number | null
          created_at?: string | null
          id?: string
          is_available?: boolean | null
          is_new?: boolean | null
          iu_per_1k_input?: number | null
          iu_per_1k_output?: number | null
          min_tier_level?: number | null
          model_display_name: string
          model_display_name_mm?: string | null
          model_id: string
          provider: string
        }
        Update: {
          base_iu_per_request?: number | null
          created_at?: string | null
          id?: string
          is_available?: boolean | null
          is_new?: boolean | null
          iu_per_1k_input?: number | null
          iu_per_1k_output?: number | null
          min_tier_level?: number | null
          model_display_name?: string
          model_display_name_mm?: string | null
          model_id?: string
          provider?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_name: string | null
          account_number: string | null
          created_at: string
          created_by: string | null
          display_order: number | null
          id: string
          instructions: string | null
          is_active: boolean | null
          name: string
          qr_code_url: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          name: string
          qr_code_url?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          name?: string
          qr_code_url?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_messages: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string
          id: string
          priority: number
          processed_at: string | null
          session_id: string
          source_channel: string | null
          status: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string
          id?: string
          priority?: number
          processed_at?: string | null
          session_id: string
          source_channel?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          priority?: number
          processed_at?: string | null
          session_id?: string
          source_channel?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      post_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      post_engagements: {
        Row: {
          engaged_at: string | null
          engagement_type: string
          id: string
          post_id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          engaged_at?: string | null
          engagement_type: string
          id?: string
          post_id: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          engaged_at?: string | null
          engagement_type?: string
          id?: string
          post_id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_engagements_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_engagements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      post_views: {
        Row: {
          id: string
          post_id: string
          session_id: string | null
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          post_id: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          post_id?: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string | null
          category_id: string | null
          content: Json
          content_html: string | null
          created_at: string | null
          external_link: string | null
          id: string
          is_published: boolean | null
          published_at: string | null
          slug: string
          summary: string | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          content: Json
          content_html?: string | null
          created_at?: string | null
          external_link?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          slug: string
          summary?: string | null
          thumbnail_url?: string | null
          title: string
          type?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          content?: Json
          content_html?: string | null
          created_at?: string | null
          external_link?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          slug?: string
          summary?: string | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "post_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_subscriptions: {
        Row: {
          amount_paid: number
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          duration_days: number | null
          expires_at: string | null
          id: string
          payment_method_id: string | null
          payment_notes: string | null
          payment_receipt_url: string | null
          plan_type: string
          rejected_at: string | null
          rejection_reason: string | null
          starts_at: string | null
          status: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_paid: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          payment_method_id?: string | null
          payment_notes?: string | null
          payment_receipt_url?: string | null
          plan_type?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          starts_at?: string | null
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          duration_days?: number | null
          expires_at?: string | null
          id?: string
          payment_method_id?: string | null
          payment_notes?: string | null
          payment_receipt_url?: string | null
          plan_type?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          starts_at?: string | null
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_subscriptions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banned_at: string | null
          banned_by: string | null
          created_at: string | null
          email: string | null
          enforce_single_device: boolean | null
          full_name: string | null
          id: string
          invite_code: string | null
          is_banned: boolean | null
          max_concurrent_sessions: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          banned_at?: string | null
          banned_by?: string | null
          created_at?: string | null
          email?: string | null
          enforce_single_device?: boolean | null
          full_name?: string | null
          id?: string
          invite_code?: string | null
          is_banned?: boolean | null
          max_concurrent_sessions?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          banned_at?: string | null
          banned_by?: string | null
          created_at?: string | null
          email?: string | null
          enforce_single_device?: boolean | null
          full_name?: string | null
          id?: string
          invite_code?: string | null
          is_banned?: boolean | null
          max_concurrent_sessions?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string | null
          id: string
          total_credits_earned: number | null
          total_referrals: number | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          total_credits_earned?: number | null
          total_referrals?: number | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          total_credits_earned?: number | null
          total_referrals?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      referral_settings: {
        Row: {
          id: string
          is_enabled: boolean
          referee_credits: number
          referrer_credits: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_enabled?: boolean
          referee_credits?: number
          referrer_credits?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_enabled?: boolean
          referee_credits?: number
          referrer_credits?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string | null
          credits_awarded: number
          id: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          credits_awarded?: number
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_user_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          credits_awarded?: number
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "referrals_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      reflexive_learning: {
        Row: {
          created_at: string
          evidence: Json
          hits: number
          id: string
          is_active: boolean
          last_retrieved_at: string | null
          lesson_learned: string
          task_signature: string
          task_signature_embedding: string | null
          trigger_type: string
          user_id: string
          what_went_wrong: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          hits?: number
          id?: string
          is_active?: boolean
          last_retrieved_at?: string | null
          lesson_learned: string
          task_signature: string
          task_signature_embedding?: string | null
          trigger_type: string
          user_id: string
          what_went_wrong: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          hits?: number
          id?: string
          is_active?: boolean
          last_retrieved_at?: string | null
          lesson_learned?: string
          task_signature?: string
          task_signature_embedding?: string | null
          trigger_type?: string
          user_id?: string
          what_went_wrong?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          ip_address: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      session_settings: {
        Row: {
          default_session_timeout_minutes: number | null
          global_enforce_single_device: boolean | null
          id: string
          max_concurrent_sessions_default: number | null
          suspicious_login_threshold: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          default_session_timeout_minutes?: number | null
          global_enforce_single_device?: boolean | null
          id?: string
          max_concurrent_sessions_default?: number | null
          suspicious_login_threshold?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          default_session_timeout_minutes?: number | null
          global_enforce_single_device?: boolean | null
          id?: string
          max_concurrent_sessions_default?: number | null
          suspicious_login_threshold?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      srt_global_settings: {
        Row: {
          allow_gateway_access: boolean | null
          allow_personal_api_key: boolean | null
          gateway_model: string | null
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          allow_gateway_access?: boolean | null
          allow_personal_api_key?: boolean | null
          gateway_model?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          allow_gateway_access?: boolean | null
          allow_personal_api_key?: boolean | null
          gateway_model?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      srt_subtitle_styles: {
        Row: {
          animation_type: string | null
          background_color: string | null
          created_at: string | null
          font_family: string | null
          font_size: number | null
          font_weight: string | null
          horizontal_padding: number | null
          id: string
          is_default: boolean | null
          original_font_size: number | null
          original_opacity: number | null
          original_position: string | null
          original_text_color: string | null
          outline_color: string | null
          outline_width: number | null
          position: string | null
          position_x: number | null
          position_y: number | null
          shadow_enabled: boolean | null
          show_original: boolean | null
          style_name: string
          text_alignment: string | null
          text_color: string | null
          updated_at: string | null
          user_id: string
          vertical_margin: number | null
          word_highlight_color: string | null
          word_highlight_enabled: boolean | null
        }
        Insert: {
          animation_type?: string | null
          background_color?: string | null
          created_at?: string | null
          font_family?: string | null
          font_size?: number | null
          font_weight?: string | null
          horizontal_padding?: number | null
          id?: string
          is_default?: boolean | null
          original_font_size?: number | null
          original_opacity?: number | null
          original_position?: string | null
          original_text_color?: string | null
          outline_color?: string | null
          outline_width?: number | null
          position?: string | null
          position_x?: number | null
          position_y?: number | null
          shadow_enabled?: boolean | null
          show_original?: boolean | null
          style_name?: string
          text_alignment?: string | null
          text_color?: string | null
          updated_at?: string | null
          user_id: string
          vertical_margin?: number | null
          word_highlight_color?: string | null
          word_highlight_enabled?: boolean | null
        }
        Update: {
          animation_type?: string | null
          background_color?: string | null
          created_at?: string | null
          font_family?: string | null
          font_size?: number | null
          font_weight?: string | null
          horizontal_padding?: number | null
          id?: string
          is_default?: boolean | null
          original_font_size?: number | null
          original_opacity?: number | null
          original_position?: string | null
          original_text_color?: string | null
          outline_color?: string | null
          outline_width?: number | null
          position?: string | null
          position_x?: number | null
          position_y?: number | null
          shadow_enabled?: boolean | null
          show_original?: boolean | null
          style_name?: string
          text_alignment?: string | null
          text_color?: string | null
          updated_at?: string | null
          user_id?: string
          vertical_margin?: number | null
          word_highlight_color?: string | null
          word_highlight_enabled?: boolean | null
        }
        Relationships: []
      }
      srt_translations: {
        Row: {
          ai_cost_estimate: number | null
          ai_model_used: string | null
          ai_tokens_input: number | null
          ai_tokens_output: number | null
          ai_tokens_total: number | null
          chunk_srts: Json | null
          created_at: string
          current_step: string | null
          duration_seconds: number | null
          error_message: string | null
          file_size_bytes: number | null
          id: string
          is_chunked_processing: boolean | null
          original_language: string | null
          original_srt_content: string | null
          original_text: string | null
          processed_chunks: number | null
          processing_time_ms: number | null
          progress_percent: number | null
          source_language: string | null
          srt_content: string | null
          status: string | null
          step_message: string | null
          target_language: string | null
          total_chunks: number | null
          translated_text: string | null
          updated_at: string
          user_id: string
          video_name: string
          video_source: string | null
          video_url: string | null
          youtube_url: string | null
          youtube_video_id: string | null
        }
        Insert: {
          ai_cost_estimate?: number | null
          ai_model_used?: string | null
          ai_tokens_input?: number | null
          ai_tokens_output?: number | null
          ai_tokens_total?: number | null
          chunk_srts?: Json | null
          created_at?: string
          current_step?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          is_chunked_processing?: boolean | null
          original_language?: string | null
          original_srt_content?: string | null
          original_text?: string | null
          processed_chunks?: number | null
          processing_time_ms?: number | null
          progress_percent?: number | null
          source_language?: string | null
          srt_content?: string | null
          status?: string | null
          step_message?: string | null
          target_language?: string | null
          total_chunks?: number | null
          translated_text?: string | null
          updated_at?: string
          user_id: string
          video_name: string
          video_source?: string | null
          video_url?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          ai_cost_estimate?: number | null
          ai_model_used?: string | null
          ai_tokens_input?: number | null
          ai_tokens_output?: number | null
          ai_tokens_total?: number | null
          chunk_srts?: Json | null
          created_at?: string
          current_step?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: string
          is_chunked_processing?: boolean | null
          original_language?: string | null
          original_srt_content?: string | null
          original_text?: string | null
          processed_chunks?: number | null
          processing_time_ms?: number | null
          progress_percent?: number | null
          source_language?: string | null
          srt_content?: string | null
          status?: string | null
          step_message?: string | null
          target_language?: string | null
          total_chunks?: number | null
          translated_text?: string | null
          updated_at?: string
          user_id?: string
          video_name?: string
          video_source?: string | null
          video_url?: string | null
          youtube_url?: string | null
          youtube_video_id?: string | null
        }
        Relationships: []
      }
      srt_user_settings: {
        Row: {
          allow_gateway_fallback: boolean | null
          created_at: string | null
          gemini_api_key: string | null
          gemini_model: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          last_translation_at: string | null
          notes: string | null
          total_translations: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allow_gateway_fallback?: boolean | null
          created_at?: string | null
          gemini_api_key?: string | null
          gemini_model?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          last_translation_at?: string | null
          notes?: string | null
          total_translations?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allow_gateway_fallback?: boolean | null
          created_at?: string | null
          gemini_api_key?: string | null
          gemini_model?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          last_translation_at?: string | null
          notes?: string | null
          total_translations?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_error_logs: {
        Row: {
          context: Json | null
          created_at: string
          error_message: string
          error_source: string
          error_stack: string | null
          id: string
          resolved: boolean
          resolved_by: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_message: string
          error_source: string
          error_stack?: string | null
          id?: string
          resolved?: boolean
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_message?: string
          error_source?: string
          error_stack?: string | null
          id?: string
          resolved?: boolean
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      task_completions: {
        Row: {
          completed_at: string | null
          completed_by: string
          id: string
          points_earned: number
          task_id: string
          week_number: number
          workspace_id: string
          year: number
        }
        Insert: {
          completed_at?: string | null
          completed_by: string
          id?: string
          points_earned: number
          task_id: string
          week_number: number
          workspace_id: string
          year: number
        }
        Update: {
          completed_at?: string | null
          completed_by?: string
          id?: string
          points_earned?: number
          task_id?: string
          week_number?: number
          workspace_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workspace_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_subscriptions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          granted_by: string | null
          id: string
          max_bots: number
          notes: string | null
          tier: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          max_bots?: number
          notes?: string | null
          tier?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          max_bots?: number
          notes?: string | null
          tier?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_processed_updates: {
        Row: {
          processed_at: string
          update_id: number
        }
        Insert: {
          processed_at?: string
          update_id: number
        }
        Update: {
          processed_at?: string
          update_id?: number
        }
        Relationships: []
      }
      theme_settings: {
        Row: {
          id: string
          primary_color: string
          theme_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          primary_color?: string
          theme_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          primary_color?: string
          theme_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tier_registry: {
        Row: {
          allowed_claude_models: string[] | null
          allowed_gemini_models: string[]
          color_gradient: string | null
          created_at: string | null
          daily_iu_limit: number
          default_model: string
          display_name: string
          display_name_mm: string | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          iu_bonus_with_key: number | null
          max_context_window: number | null
          monthly_price_mmk: number | null
          priority_label: string | null
          priority_level: number | null
          tier_key: string
        }
        Insert: {
          allowed_claude_models?: string[] | null
          allowed_gemini_models: string[]
          color_gradient?: string | null
          created_at?: string | null
          daily_iu_limit: number
          default_model: string
          display_name: string
          display_name_mm?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          iu_bonus_with_key?: number | null
          max_context_window?: number | null
          monthly_price_mmk?: number | null
          priority_label?: string | null
          priority_level?: number | null
          tier_key: string
        }
        Update: {
          allowed_claude_models?: string[] | null
          allowed_gemini_models?: string[]
          color_gradient?: string | null
          created_at?: string | null
          daily_iu_limit?: number
          default_model?: string
          display_name?: string
          display_name_mm?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          iu_bonus_with_key?: number | null
          max_context_window?: number | null
          monthly_price_mmk?: number | null
          priority_label?: string | null
          priority_level?: number | null
          tier_key?: string
        }
        Relationships: []
      }
      transaction_categories: {
        Row: {
          color: string
          created_at: string | null
          icon: string
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          name_my: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          icon?: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          name_my?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          icon?: string
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          name_my?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      two_fa_verification_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          action_type: string
          api_source: string | null
          created_at: string | null
          feature_key: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action_type: string
          api_source?: string | null
          created_at?: string | null
          feature_key: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action_type?: string
          api_source?: string | null
          created_at?: string | null
          feature_key?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_2fa: {
        Row: {
          backup_codes: string[]
          created_at: string
          enabled_at: string | null
          id: string
          is_enabled: boolean
          totp_secret: string
          updated_at: string
          user_id: string
        }
        Insert: {
          backup_codes: string[]
          created_at?: string
          enabled_at?: string | null
          id?: string
          is_enabled?: boolean
          totp_secret: string
          updated_at?: string
          user_id: string
        }
        Update: {
          backup_codes?: string[]
          created_at?: string
          enabled_at?: string | null
          id?: string
          is_enabled?: boolean
          totp_secret?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agent_settings: {
        Row: {
          agentic_sdk_enabled: boolean
          bot_emoji: string
          bot_name: string
          created_at: string | null
          custom_instructions: string | null
          id: string
          mcp_postgres_enabled: boolean
          personality_level: string
          personality_mode: string
          pge_min_complexity: string
          pge_pipeline_enabled: boolean
          preferred_language: string | null
          preferred_morning_hour: number | null
          preferred_name: string | null
          preferred_review_day: number | null
          strict_mode: boolean
          timezone: string | null
          tool_search_enabled: boolean
          updated_at: string | null
          user_id: string
          welcome_shown: boolean
        }
        Insert: {
          agentic_sdk_enabled?: boolean
          bot_emoji?: string
          bot_name?: string
          created_at?: string | null
          custom_instructions?: string | null
          id?: string
          mcp_postgres_enabled?: boolean
          personality_level?: string
          personality_mode?: string
          pge_min_complexity?: string
          pge_pipeline_enabled?: boolean
          preferred_language?: string | null
          preferred_morning_hour?: number | null
          preferred_name?: string | null
          preferred_review_day?: number | null
          strict_mode?: boolean
          timezone?: string | null
          tool_search_enabled?: boolean
          updated_at?: string | null
          user_id: string
          welcome_shown?: boolean
        }
        Update: {
          agentic_sdk_enabled?: boolean
          bot_emoji?: string
          bot_name?: string
          created_at?: string | null
          custom_instructions?: string | null
          id?: string
          mcp_postgres_enabled?: boolean
          personality_level?: string
          personality_mode?: string
          pge_min_complexity?: string
          pge_pipeline_enabled?: boolean
          preferred_language?: string | null
          preferred_morning_hour?: number | null
          preferred_name?: string | null
          preferred_review_day?: number | null
          strict_mode?: boolean
          timezone?: string | null
          tool_search_enabled?: boolean
          updated_at?: string | null
          user_id?: string
          welcome_shown?: boolean
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          api_key_encrypted: string
          created_at: string | null
          id: string
          is_active: boolean | null
          provider: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_key_encrypted: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_key_encrypted?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          provider?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_budgets: {
        Row: {
          alert_threshold_pct: number
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          period: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_threshold_pct?: number
          amount: number
          category_id?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          period?: string
          start_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_threshold_pct?: number
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          period?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_context_state: {
        Row: {
          active_goals: Json
          emotional_baseline: string | null
          preference_summary: string | null
          recent_themes: string[]
          source_episodic_count: number
          source_semantic_count: number
          synthesis_model: string | null
          synthesized_at: string
          topic_clusters: Json
          ttl_minutes: number
          user_id: string
          writing_style: string | null
        }
        Insert: {
          active_goals?: Json
          emotional_baseline?: string | null
          preference_summary?: string | null
          recent_themes?: string[]
          source_episodic_count?: number
          source_semantic_count?: number
          synthesis_model?: string | null
          synthesized_at?: string
          topic_clusters?: Json
          ttl_minutes?: number
          user_id: string
          writing_style?: string | null
        }
        Update: {
          active_goals?: Json
          emotional_baseline?: string | null
          preference_summary?: string | null
          recent_themes?: string[]
          source_episodic_count?: number
          source_semantic_count?: number
          synthesis_model?: string | null
          synthesized_at?: string
          topic_clusters?: Json
          ttl_minutes?: number
          user_id?: string
          writing_style?: string | null
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string | null
          id: string
          iu_balance: number | null
          iu_bonus: number | null
          preferred_model: string | null
          preferred_provider: string | null
          pro_bonus_credits: number | null
          tier_key: string | null
          total_earned: number
          total_spent: number
          trial_credits_used: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string | null
          id?: string
          iu_balance?: number | null
          iu_bonus?: number | null
          preferred_model?: string | null
          preferred_provider?: string | null
          pro_bonus_credits?: number | null
          tier_key?: string | null
          total_earned?: number
          total_spent?: number
          trial_credits_used?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string | null
          id?: string
          iu_balance?: number | null
          iu_bonus?: number | null
          preferred_model?: string | null
          preferred_provider?: string | null
          pro_bonus_credits?: number | null
          tier_key?: string | null
          total_earned?: number
          total_spent?: number
          trial_credits_used?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          ai_analysis: Json | null
          ai_confidence: number | null
          ai_processed_at: string | null
          ai_suggested_fix: Json | null
          attachments: Json | null
          browser_info: Json | null
          created_at: string | null
          description: string
          error_details: Json | null
          feedback_type: string
          id: string
          page_url: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_confidence?: number | null
          ai_processed_at?: string | null
          ai_suggested_fix?: Json | null
          attachments?: Json | null
          browser_info?: Json | null
          created_at?: string | null
          description: string
          error_details?: Json | null
          feedback_type: string
          id?: string
          page_url?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_confidence?: number | null
          ai_processed_at?: string | null
          ai_suggested_fix?: Json | null
          attachments?: Json | null
          browser_info?: Json | null
          created_at?: string | null
          description?: string
          error_details?: Json | null
          feedback_type?: string
          id?: string
          page_url?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_investments: {
        Row: {
          account_id: string | null
          asset_type: string
          avg_cost_per_unit: number
          created_at: string
          currency: string
          current_price: number | null
          id: string
          last_priced_at: string | null
          notes: string | null
          quantity: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          asset_type?: string
          avg_cost_per_unit: number
          created_at?: string
          currency?: string
          current_price?: number | null
          id?: string
          last_priced_at?: string | null
          notes?: string | null
          quantity: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          asset_type?: string
          avg_cost_per_unit?: number
          created_at?: string
          currency?: string
          current_price?: number | null
          id?: string
          last_priced_at?: string | null
          notes?: string | null
          quantity?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_investments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lesson_progress: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_memories: {
        Row: {
          category: string
          confidence: number
          content: string
          created_at: string
          curator_reason: string | null
          curator_score: number | null
          embedding: string | null
          expiry: string | null
          id: string
          is_active: boolean
          last_accessed: string
          merged_from: string[] | null
          normalized_key: string | null
          pinned: boolean
          priority: number
          scope: string
          scope_key: string | null
          source_actor: string | null
          source_platform: string | null
          source_session_id: string | null
          tags: string[]
          user_id: string
        }
        Insert: {
          category?: string
          confidence?: number
          content: string
          created_at?: string
          curator_reason?: string | null
          curator_score?: number | null
          embedding?: string | null
          expiry?: string | null
          id?: string
          is_active?: boolean
          last_accessed?: string
          merged_from?: string[] | null
          normalized_key?: string | null
          pinned?: boolean
          priority?: number
          scope?: string
          scope_key?: string | null
          source_actor?: string | null
          source_platform?: string | null
          source_session_id?: string | null
          tags?: string[]
          user_id: string
        }
        Update: {
          category?: string
          confidence?: number
          content?: string
          created_at?: string
          curator_reason?: string | null
          curator_score?: number | null
          embedding?: string | null
          expiry?: string | null
          id?: string
          is_active?: boolean
          last_accessed?: string
          merged_from?: string[] | null
          normalized_key?: string | null
          pinned?: boolean
          priority?: number
          scope?: string
          scope_key?: string | null
          source_actor?: string | null
          source_platform?: string | null
          source_session_id?: string | null
          tags?: string[]
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          course_updates: boolean | null
          created_at: string | null
          email_notifications: boolean | null
          enrollment_notifications: boolean | null
          id: string
          language: string | null
          push_notifications: boolean | null
          theme: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          course_updates?: boolean | null
          created_at?: string | null
          email_notifications?: boolean | null
          enrollment_notifications?: boolean | null
          id?: string
          language?: string | null
          push_notifications?: boolean | null
          theme?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          course_updates?: boolean | null
          created_at?: string | null
          email_notifications?: boolean | null
          enrollment_notifications?: boolean | null
          id?: string
          language?: string | null
          push_notifications?: boolean | null
          theme?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_psych_profile: {
        Row: {
          behavioral_patterns: Json
          created_at: string
          dark_traits: string | null
          id: string
          interaction_style: string | null
          mood_history: Json
          traits: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          behavioral_patterns?: Json
          created_at?: string
          dark_traits?: string | null
          id?: string
          interaction_style?: string | null
          mood_history?: Json
          traits?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          behavioral_patterns?: Json
          created_at?: string
          dark_traits?: string | null
          id?: string
          interaction_style?: string | null
          mood_history?: Json
          traits?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          browser: string | null
          city: string | null
          coordinates: Json | null
          country: string | null
          created_at: string
          device_info: string | null
          device_name: string | null
          device_type: string | null
          expires_at: string
          id: string
          ip_address: string | null
          is_active: boolean
          is_trusted: boolean | null
          last_activity: string
          os: string | null
          region: string | null
          revoked_at: string | null
          revoked_by: string | null
          session_token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          coordinates?: Json | null
          country?: string | null
          created_at?: string
          device_info?: string | null
          device_name?: string | null
          device_type?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          is_trusted?: boolean | null
          last_activity?: string
          os?: string | null
          region?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          session_token: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          coordinates?: Json | null
          country?: string | null
          created_at?: string
          device_info?: string | null
          device_name?: string | null
          device_type?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          is_trusted?: boolean | null
          last_activity?: string
          os?: string | null
          region?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          session_token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_statistics: {
        Row: {
          achievements_count: number | null
          completed_courses_count: number | null
          created_at: string | null
          current_streak: number | null
          id: string
          last_activity_date: string | null
          longest_streak: number | null
          total_lessons_completed: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          achievements_count?: number | null
          completed_courses_count?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          longest_streak?: number | null
          total_lessons_completed?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          achievements_count?: number | null
          completed_courses_count?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          longest_streak?: number | null
          total_lessons_completed?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          account_id: string | null
          amount: number
          billing_cycle: string
          category_id: string | null
          color: string | null
          created_at: string | null
          currency: string
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          next_billing_date: string
          reminder_days_before: number | null
          reminder_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          billing_cycle?: string
          category_id?: string | null
          color?: string | null
          created_at?: string | null
          currency?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          next_billing_date: string
          reminder_days_before?: number | null
          reminder_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          billing_cycle?: string
          category_id?: string | null
          color?: string | null
          created_at?: string | null
          currency?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          next_billing_date?: string
          reminder_days_before?: number | null
          reminder_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tax_profile: {
        Row: {
          allowances: Json
          country_code: string
          created_at: string
          custom_brackets: Json | null
          filing_status: string
          id: string
          notes: string | null
          tax_year_start_month: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allowances?: Json
          country_code?: string
          created_at?: string
          custom_brackets?: Json | null
          filing_status?: string
          id?: string
          notes?: string | null
          tax_year_start_month?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allowances?: Json
          country_code?: string
          created_at?: string
          custom_brackets?: Json | null
          filing_status?: string
          id?: string
          notes?: string | null
          tax_year_start_month?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_token_quotas: {
        Row: {
          created_at: string | null
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          quota_type: string | null
          rpd_current: number | null
          rpd_limit: number | null
          rpd_reset_at: string | null
          rpm_current: number | null
          rpm_limit: number | null
          rpm_reset_at: string | null
          tokens_granted: number | null
          tokens_used: number | null
          tpm_current: number | null
          tpm_limit: number | null
          tpm_reset_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          quota_type?: string | null
          rpd_current?: number | null
          rpd_limit?: number | null
          rpd_reset_at?: string | null
          rpm_current?: number | null
          rpm_limit?: number | null
          rpm_reset_at?: string | null
          tokens_granted?: number | null
          tokens_used?: number | null
          tpm_current?: number | null
          tpm_limit?: number | null
          tpm_reset_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          quota_type?: string | null
          rpd_current?: number | null
          rpd_limit?: number | null
          rpd_reset_at?: string | null
          rpm_current?: number | null
          rpm_limit?: number | null
          rpm_reset_at?: string | null
          tokens_granted?: number | null
          tokens_used?: number | null
          tpm_current?: number | null
          tpm_limit?: number | null
          tpm_reset_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_transactions: {
        Row: {
          account_id: string
          amount: number
          attachment_url: string | null
          category_id: string | null
          created_at: string | null
          currency: string
          description: string | null
          id: string
          is_recurring: boolean | null
          notes: string | null
          recurring_id: string | null
          tags: string[] | null
          transaction_date: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          recurring_id?: string | null
          tags?: string[] | null
          transaction_date?: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          attachment_url?: string | null
          category_id?: string | null
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          recurring_id?: string | null
          tags?: string[] | null
          transaction_date?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "transaction_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_snapshots: {
        Row: {
          created_at: string | null
          height: number | null
          html: string
          id: string
          message_id: string
          preset: string | null
          session_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          height?: number | null
          html: string
          id?: string
          message_id: string
          preset?: string | null
          session_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          height?: number | null
          html?: string
          id?: string
          message_id?: string
          preset?: string | null
          session_id?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          target_user_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string | null
          personal_score: number | null
          responded_at: string | null
          role: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          personal_score?: number | null
          responded_at?: string | null
          role: string
          status?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          personal_score?: number | null
          responded_at?: string | null
          role?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_tasks: {
        Row: {
          assignee_id: string | null
          category: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          points: number
          status: string
          title: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          points?: number
          status?: string
          title: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          points?: number
          status?: string
          title?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_transfers: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          responded_at: string | null
          status: string
          to_user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          responded_at?: string | null
          status?: string
          to_user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          responded_at?: string | null
          status?: string
          to_user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_transfers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string | null
          creator_id: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          total_points: number | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string | null
          creator_id: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          total_points?: number | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string | null
          creator_id?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          total_points?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_generation_lock: {
        Args: {
          p_lock_duration_seconds?: number
          p_lock_id: string
          p_response_id: string
        }
        Returns: Json
      }
      acquire_session_lock: {
        Args: { session_uuid: string; timeout_ms?: number }
        Returns: boolean
      }
      admin_bulk_grant_iu: {
        Args: { admin_user_id: string; grant_amount: number }
        Returns: Json
      }
      admin_clear_ai_user_key: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      admin_create_pro_subscription:
        | {
            Args: {
              p_admin_user_id: string
              p_duration_days?: number
              p_notes?: string
              p_plan_type?: string
              p_target_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_admin_id: string
              p_duration_days?: number
              p_user_email: string
            }
            Returns: Json
          }
      admin_grant_premium_access: {
        Args: {
          p_duration_months?: number
          p_target_user_id: string
          p_tier: string
        }
        Returns: Json
      }
      admin_logout_all_user_sessions: {
        Args: { p_admin_user_id: string; p_user_id: string }
        Returns: Json
      }
      admin_logout_user_session: {
        Args: { p_admin_user_id: string; p_session_id: string }
        Returns: Json
      }
      admin_reset_cr_attempts: {
        Args: { p_new_attempts?: number; p_target_user_id: string }
        Returns: Json
      }
      admin_search_users: {
        Args: { result_limit?: number; search_query: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      admin_set_cr_premium: {
        Args: { p_is_premium: boolean; p_target_user_id: string }
        Returns: Json
      }
      admin_sync_user_email: {
        Args: { new_email: string; target_user_id: string }
        Returns: undefined
      }
      admin_toggle_ai_user_gateway: {
        Args: { p_allow_gateway: boolean; p_target_user_id: string }
        Returns: Json
      }
      admin_toggle_ai_user_premium: {
        Args: { p_is_premium: boolean; p_target_user_id: string }
        Returns: Json
      }
      agentic_dashboard_summary: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      agentic_forecast: {
        Args: {
          p_channel_id: string
          p_horizon_days?: number
          p_lookback_days?: number
          p_metric: string
        }
        Returns: Json
      }
      agentic_goal_progress: { Args: never; Returns: Json }
      agentic_top_posts: {
        Args: {
          p_from: string
          p_limit?: number
          p_metric: string
          p_to: string
        }
        Returns: Json
      }
      approve_pro_subscription: {
        Args: { p_admin_id: string; p_subscription_id: string }
        Returns: Json
      }
      archive_episodic_with_embedding: {
        Args: {
          p_content: string
          p_content_summary?: string
          p_embedding?: string
          p_importance_score?: number
          p_metadata?: Json
          p_session_id: string
          p_topic_tags?: string[]
          p_user_id: string
        }
        Returns: string
      }
      archive_workspace: { Args: { p_workspace_id: string }; Returns: Json }
      auto_publish_scheduled_posts: { Args: never; Returns: undefined }
      beebot_query_world_model: {
        Args: { p_depth?: number; p_entity_id: string; p_user_id: string }
        Returns: Json
      }
      beebot_recall_lessons: {
        Args: {
          p_limit?: number
          p_min_confidence?: number
          p_query_embedding: string
          p_user_id: string
        }
        Returns: {
          category: string
          confidence: number
          id: string
          lesson_text: string
          similarity: number
        }[]
      }
      beebot_upsert_entity: {
        Args: {
          p_attrs?: Json
          p_canonical_key: string
          p_description?: string
          p_embedding?: string
          p_importance?: number
          p_name: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      can_add_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      can_create_workspace: { Args: { p_user_id: string }; Returns: Json }
      cancel_ownership_transfer: {
        Args: { p_transfer_id: string }
        Returns: Json
      }
      change_member_role: {
        Args: {
          p_new_role: string
          p_target_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      check_and_deduct_intelligence: {
        Args: {
          p_estimated_tokens?: number
          p_feature_key?: string
          p_model_requested?: string
          p_user_id: string
        }
        Returns: Json
      }
      check_and_increment_usage: {
        Args: {
          p_action_type?: string
          p_feature_key?: string
          p_user_id: string
        }
        Returns: Json
      }
      check_cr_access: { Args: { p_user_id: string }; Returns: Json }
      check_premium_blueprint_access: {
        Args: { p_user_id: string }
        Returns: Json
      }
      check_quota_status: { Args: { p_user_id: string }; Returns: Json }
      check_silent_sessions: { Args: never; Returns: undefined }
      check_system_api_key_exists: { Args: never; Returns: boolean }
      check_system_api_keys_status: { Args: never; Returns: Json }
      check_user_api_key_exists: {
        Args: { p_provider: string; p_user_id: string }
        Returns: boolean
      }
      check_user_has_anthropic_api_key: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      check_user_has_cr_api_key: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      check_user_has_gemini_api_key: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      check_user_has_srt_api_key: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      clean_old_login_attempts: { Args: never; Returns: undefined }
      cleanup_expired_agent_data: { Args: never; Returns: undefined }
      cleanup_expired_generation_locks: {
        Args: never
        Returns: {
          cleaned_response_id: string
          expired_at: string
          lock_id: string
          locked_at: string
        }[]
      }
      cleanup_expired_memories: { Args: never; Returns: number }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_old_logs: { Args: never; Returns: undefined }
      cleanup_old_session_summaries: { Args: never; Returns: undefined }
      cleanup_stale_generations: { Args: never; Returns: number }
      complete_workspace_task: { Args: { p_task_id: string }; Returns: Json }
      deduct_cr_attempt: { Args: { p_user_id: string }; Returns: Json }
      deduct_generation_credits: {
        Args: { p_content_id?: string; p_user_id: string }
        Returns: Json
      }
      expire_old_enrollments: { Args: never; Returns: undefined }
      expire_pro_subscriptions: { Args: never; Returns: number }
      finalize_stale_autonomous_tasks: { Args: never; Returns: undefined }
      generate_referral_code: { Args: { p_user_id: string }; Returns: string }
      generate_slug: { Args: { text_input: string }; Returns: string }
      get_anthropic_system_api_key: { Args: never; Returns: string }
      get_google_system_api_key: { Args: never; Returns: string }
      get_job_dependency_chain: {
        Args: { p_job_id: string }
        Returns: {
          depth: number
          is_blocking: boolean
          job_id: string
          status: string
          title: string
        }[]
      }
      get_last_pulse_per_user: {
        Args: never
        Returns: {
          last_pulse: string
          user_id: string
        }[]
      }
      get_memory_counts: {
        Args: never
        Returns: {
          count: number
          user_id: string
        }[]
      }
      get_recent_session_summaries: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          created_at: string
          session_key: string
          summary: Json
        }[]
      }
      get_system_api_key: { Args: never; Returns: string }
      get_table_columns: {
        Args: never
        Returns: {
          column_default: string
          column_name: string
          data_type: string
          is_nullable: string
          table_name: string
        }[]
      }
      get_tables_without_pk: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      get_tables_without_rls: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      get_user_agent_skills: { Args: { p_user_id: string }; Returns: Json }
      get_user_app_context: { Args: { p_user_id: string }; Returns: Json }
      get_user_comprehensive_status: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_user_course_progress: {
        Args: { p_user_id: string }
        Returns: {
          completed_lessons: number
          course_id: string
          course_thumbnail: string
          course_title: string
          progress_percentage: number
          total_lessons: number
        }[]
      }
      get_user_intelligence_status: {
        Args: { p_user_id?: string }
        Returns: Json
      }
      get_user_plan_limits: { Args: { p_user_id: string }; Returns: Json }
      get_user_plan_status: { Args: { p_user_id: string }; Returns: Json }
      get_user_trust_level: { Args: { p_user_id: string }; Returns: Json }
      get_user_workspace_ids: { Args: { p_user_id: string }; Returns: string[] }
      get_workspace_permission: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_content_usage: {
        Args: { content_id: string }
        Returns: undefined
      }
      increment_course_view_count: {
        Args: { course_id: string }
        Returns: undefined
      }
      increment_post_view_count: {
        Args: { post_id: string }
        Returns: undefined
      }
      increment_quota_usage: {
        Args: { p_requests?: number; p_tokens: number; p_user_id: string }
        Returns: Json
      }
      increment_sessions_since_dream: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      increment_template_usage: {
        Args: { template_id: string }
        Returns: undefined
      }
      initiate_ownership_transfer: {
        Args: { p_to_user_id: string; p_workspace_id: string }
        Returns: Json
      }
      is_pro_user: { Args: { p_user_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      leave_workspace: { Args: { p_workspace_id: string }; Returns: Json }
      log_admin_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_ip_address?: string
          p_resource_id?: string
          p_resource_type?: string
          p_user_agent?: string
        }
        Returns: string
      }
      log_workspace_activity: {
        Args: {
          p_action: string
          p_details?: Json
          p_target_user_id?: string
          p_workspace_id: string
        }
        Returns: string
      }
      match_chat_memories: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_user_id?: string
          query_embedding: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          importance_score: number
          similarity: number
          topic_tags: string[]
        }[]
      }
      match_reflexive_lessons: {
        Args: {
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
          p_user_id: string
        }
        Returns: {
          id: string
          lesson_learned: string
          similarity: number
          trigger_type: string
          what_went_wrong: string
        }[]
      }
      pick_goal_tasks: {
        Args: { p_goal_id: string; p_max_batch?: number }
        Returns: {
          attempt_count: number
          checkpoint_state: Json | null
          completed_at: string | null
          created_at: string
          goal_id: string
          id: string
          max_attempts: number
          payload: Json
          priority: number
          result: Json | null
          scheduled_for: string
          started_at: string | null
          status: string
          task_type: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_task_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      process_referral_signup: {
        Args: { p_referral_code: string; p_referred_user_id: string }
        Returns: Json
      }
      rate_agent_message: {
        Args: {
          p_feedback_text?: string
          p_message_id: string
          p_rating: string
          p_user_id: string
        }
        Returns: Json
      }
      reinforce_recalled_memories: {
        Args: { p_confidence_boost?: number; p_memory_ids: string[] }
        Returns: number
      }
      reject_pro_subscription: {
        Args: {
          p_admin_user_id: string
          p_reason?: string
          p_subscription_id: string
        }
        Returns: Json
      }
      release_generation_lock: {
        Args: { p_lock_id: string; p_response_id: string }
        Returns: Json
      }
      release_session_lock: { Args: { session_uuid: string }; Returns: boolean }
      remove_workspace_member: {
        Args: { p_target_user_id: string; p_workspace_id: string }
        Returns: Json
      }
      reset_user_to_free: {
        Args: { p_admin_user_id: string; p_target_user_id: string }
        Returns: Json
      }
      respond_to_ownership_transfer: {
        Args: { p_accept: boolean; p_transfer_id: string }
        Returns: Json
      }
      respond_to_workspace_invitation: {
        Args: { p_accept: boolean; p_workspace_id: string }
        Returns: Json
      }
      restore_workspace: { Args: { p_workspace_id: string }; Returns: Json }
      search_episodic_memory: {
        Args: {
          p_limit?: number
          p_query_embedding: string
          p_time_range?: string
          p_user_id: string
        }
        Returns: {
          content_summary: string
          created_at: string
          id: string
          session_id: string
          session_title: string
          similarity: number
          topic_tags: string[]
        }[]
      }
      search_knowledge_base_semantic: {
        Args: {
          p_category?: string
          p_language?: string
          p_limit?: number
          p_query_embedding: string
        }
        Returns: {
          category: string
          content_chunk: string
          content_id: string
          language: string
          similarity: number
          title: string
        }[]
      }
      search_personal_knowledge: {
        Args: {
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
          p_user_id: string
        }
        Returns: {
          category: string
          content: string
          created_at: string
          id: string
          similarity: number
          source_type: string
          tags: string[]
          title: string
        }[]
      }
      search_user_memories:
        | {
            Args: {
              p_category?: string
              p_limit?: number
              p_query_embedding: string
              p_user_id: string
            }
            Returns: {
              category: string
              confidence: number
              content: string
              created_at: string
              id: string
              similarity: number
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_query_embedding: string
              p_user_id: string
            }
            Returns: {
              category: string
              created_at: string
              id: string
              memory_key: string
              memory_value: string
              similarity: number
            }[]
          }
      seed_default_heartbeats: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      set_system_api_key: { Args: { p_api_key: string }; Returns: undefined }
      set_system_api_keys: {
        Args: { p_anthropic_key?: string; p_google_key?: string }
        Returns: Json
      }
      set_user_preferred_model: {
        Args: { p_model_id: string; p_provider?: string }
        Returns: Json
      }
      suspend_pro_subscription: {
        Args: {
          p_admin_user_id: string
          p_reason?: string
          p_subscription_id: string
        }
        Returns: Json
      }
      toggle_monitoring_goal: {
        Args: { p_goal_id?: string; p_session_id: string }
        Returns: undefined
      }
      unsuspend_pro_subscription: {
        Args: { p_admin_user_id: string; p_subscription_id: string }
        Returns: Json
      }
    }
    Enums: {
      agentic_autonomy: "advisor" | "semi_auto" | "full_auto"
      agentic_metric_type:
        | "views"
        | "followers"
        | "revenue"
        | "engagement"
        | "posts"
        | "impressions"
        | "reach"
      agentic_platform:
        | "facebook"
        | "youtube"
        | "tiktok"
        | "instagram"
        | "telegram"
        | "x"
        | "linkedin"
        | "threads"
        | "podcast"
        | "newsletter"
        | "other"
      agentic_revenue_source:
        | "sponsored"
        | "affiliate"
        | "adsense"
        | "subscription"
        | "product"
        | "service"
        | "tips"
        | "other"
      agentic_source: "manual" | "ocr" | "api" | "import"
      app_role: "admin" | "learner" | "creator"
      skill_status: "proposed" | "active" | "rejected" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agentic_autonomy: ["advisor", "semi_auto", "full_auto"],
      agentic_metric_type: [
        "views",
        "followers",
        "revenue",
        "engagement",
        "posts",
        "impressions",
        "reach",
      ],
      agentic_platform: [
        "facebook",
        "youtube",
        "tiktok",
        "instagram",
        "telegram",
        "x",
        "linkedin",
        "threads",
        "podcast",
        "newsletter",
        "other",
      ],
      agentic_revenue_source: [
        "sponsored",
        "affiliate",
        "adsense",
        "subscription",
        "product",
        "service",
        "tips",
        "other",
      ],
      agentic_source: ["manual", "ocr", "api", "import"],
      app_role: ["admin", "learner", "creator"],
      skill_status: ["proposed", "active", "rejected", "archived"],
    },
  },
} as const
