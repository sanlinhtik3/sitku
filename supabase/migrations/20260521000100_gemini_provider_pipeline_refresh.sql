-- Gemini provider pipeline refresh
-- - retires stale gemini-3-pro-preview from active settings
-- - adds stable Gemini 3.5 Flash / 3.1 Flash-Lite defaults
-- - keeps existing historical migrations immutable while fixing live DB state

ALTER TABLE public.ai_model_settings
  ALTER COLUMN default_gemini_model SET DEFAULT 'gemini-3.5-flash';

ALTER TABLE public.ai_model_settings
  ALTER COLUMN selected_model SET DEFAULT 'gemini-3.5-flash';

ALTER TABLE public.ai_model_settings
  ALTER COLUMN enabled_gemini_models SET DEFAULT ARRAY[
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview'
  ];

UPDATE public.ai_model_settings
SET
  selected_model = CASE
    WHEN selected_model IS NULL
      OR selected_model IN ('gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash')
      OR selected_model IN ('google/gemini-3-pro-preview', 'google/gemini-3-flash-preview', 'google/gemini-2.5-flash')
      THEN 'gemini-3.5-flash'
    ELSE selected_model
  END,
  default_gemini_model = CASE
    WHEN default_gemini_model IS NULL OR default_gemini_model = 'gemini-3-pro-preview'
      THEN 'gemini-3.5-flash'
    ELSE default_gemini_model
  END,
  enabled_gemini_models = (
    SELECT ARRAY(
      SELECT DISTINCT model_id
      FROM unnest(
        COALESCE(enabled_gemini_models, ARRAY[]::text[])
        || ARRAY[
          'gemini-3.5-flash',
          'gemini-3.1-flash-lite',
          'gemini-3.1-pro-preview',
          'gemini-2.5-flash'
        ]
      ) AS model_id
      WHERE model_id <> 'gemini-3-pro-preview'
    )
  );

UPDATE public.tier_registry
SET allowed_gemini_models = (
  SELECT ARRAY(
    SELECT DISTINCT model_id
    FROM unnest(
      allowed_gemini_models
      || CASE
        WHEN tier_key IN ('analyst', 'alpha', 'admin')
          THEN ARRAY['gemini-3.5-flash', 'gemini-3.1-pro-preview']
        ELSE ARRAY['gemini-3.1-flash-lite']
      END
    ) AS model_id
    WHERE model_id <> 'gemini-3-pro-preview'
  )
)
WHERE tier_key IN ('explorer', 'analyst', 'alpha', 'admin');

UPDATE public.tier_registry
SET default_model = CASE
  WHEN default_model = 'gemini-3-pro-preview' THEN 'gemini-3.1-pro-preview'
  WHEN default_model = 'gemini-3-flash-preview' AND tier_key = 'analyst' THEN 'gemini-3.5-flash'
  ELSE default_model
END
WHERE tier_key IN ('explorer', 'analyst', 'alpha', 'admin');

INSERT INTO public.model_cost_matrix (
  model_id,
  model_display_name,
  model_display_name_mm,
  provider,
  iu_per_1k_input,
  iu_per_1k_output,
  base_iu_per_request,
  min_tier_level,
  is_available,
  is_new
)
VALUES
  ('gemini-3.5-flash', 'Gemini 3.5 Flash', 'ဂျမ်နီ ၃.၅ Flash', 'google', 0.015, 0.060, 0.5, 1, true, true),
  ('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', 'ဂျမ်နီ ၃.၁ Flash-Lite', 'google', 0.005, 0.015, 0.25, 0, true, true)
ON CONFLICT (model_id) DO UPDATE
SET
  model_display_name = EXCLUDED.model_display_name,
  model_display_name_mm = EXCLUDED.model_display_name_mm,
  provider = EXCLUDED.provider,
  iu_per_1k_input = EXCLUDED.iu_per_1k_input,
  iu_per_1k_output = EXCLUDED.iu_per_1k_output,
  base_iu_per_request = EXCLUDED.base_iu_per_request,
  min_tier_level = EXCLUDED.min_tier_level,
  is_available = EXCLUDED.is_available,
  is_new = EXCLUDED.is_new;

UPDATE public.model_cost_matrix
SET is_available = false
WHERE model_id = 'gemini-3-pro-preview';

CREATE OR REPLACE FUNCTION public.check_system_api_keys_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'has_google_key', google_system_api_key IS NOT NULL AND google_system_api_key != '',
    'has_anthropic_key', anthropic_system_api_key IS NOT NULL AND anthropic_system_api_key != '',
    'default_gemini_model', COALESCE(default_gemini_model, 'gemini-3.5-flash'),
    'default_claude_model', COALESCE(default_claude_model, 'claude-4-5-sonnet'),
    'enable_google_provider', COALESCE(enable_google_provider, true),
    'enable_anthropic_provider', COALESCE(enable_anthropic_provider, false),
    'allow_personal_api_key', COALESCE(allow_personal_api_key, false),
    'enabled_gemini_models', COALESCE(enabled_gemini_models, ARRAY[
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview'
    ])
  ) INTO result
  FROM public.ai_model_settings
  LIMIT 1;

  RETURN COALESCE(result, jsonb_build_object(
    'has_google_key', false,
    'has_anthropic_key', false,
    'default_gemini_model', 'gemini-3.5-flash',
    'default_claude_model', 'claude-4-5-sonnet',
    'enable_google_provider', true,
    'enable_anthropic_provider', false,
    'allow_personal_api_key', false,
    'enabled_gemini_models', ARRAY[
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview'
    ]
  ));
END;
$$;
