export interface BotSettings {
  id: string;
  user_id: string;
  name: string | null;
  description: string | null;
  telegram_bot_token: string | null;
  bot_username: string | null;
  gemini_api_key: string | null;
  gemini_model: string | null;
  system_prompt: string | null;
  webhook_url: string | null;
  is_active: boolean;
  use_shared_key: boolean;
  allow_dm: boolean;
  trigger_word: string | null;
  created_at: string;
  updated_at: string;
  // Status tracking
  last_activity_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  message_count_24h: number;
  // Group bot
  group_bot_token: string | null;
  group_bot_username: string | null;
  group_bot_name: string | null;
  group_bot_custom_instruction: string | null;
  group_bot_active?: boolean;
  group_bot_allow_dm?: boolean;
  group_bot_allow_web_search?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  bot_username?: string;
  bot_name?: string;
  error?: string;
}

export interface ChannelVerifyResult {
  channel_name: string;
  channel_type: string;
  channel_id: string;
  is_admin: boolean;
  can_post_messages: boolean;
  member_count: number;
  bot_username?: string;
}

export interface BroadcastChannel {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  is_active: boolean;
  is_default: boolean;
  bot_token?: string;
  bot_username?: string;
  bot_settings_id?: string | null;
}

export interface ChannelIdentity {
  id: string;
  channel: string;
  external_username: string | null;
  is_verified: boolean;
}

export interface GroupBotVerifyResult {
  bot_username: string;
  bot_name: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
}

export interface GroupBot {
  id: string;
  user_id: string;
  bot_settings_id: string | null;
  name: string;
  bot_token: string | null;
  bot_username: string | null;
  bot_name: string | null;
  trigger_word: string | null;
  custom_instruction: string | null;
  is_active: boolean;
  allow_dm: boolean;
  allow_web_search: boolean;
  webhook_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatLog {
  id: string;
  user_id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  message: string;
  ai_reply: string | null;
  created_at: string;
}

export interface BotSubscription {
  id: string;
  user_id: string;
  tier: 'free' | 'premium';
  max_bots: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}
