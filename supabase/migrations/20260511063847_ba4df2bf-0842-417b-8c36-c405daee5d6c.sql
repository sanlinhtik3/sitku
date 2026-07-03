-- ════════════════════════════════════════════════════════════
-- AGENTIC ERA — Full Replace of AgentConsultant data layer
-- Creator-economy KPI intelligence platform
-- ════════════════════════════════════════════════════════════

-- 0) Drop legacy consultant artifacts ------------------------
DROP FUNCTION IF EXISTS public.consultant_dashboard_summary(date,date);
DROP FUNCTION IF EXISTS public.consultant_post_leaderboard(text,date,date,int);
DROP FUNCTION IF EXISTS public.consultant_finance_summary(date,date);
DROP TABLE IF EXISTS public.consultant_post_metrics CASCADE;
DROP TABLE IF EXISTS public.consultant_finance_entries CASCADE;
DROP TABLE IF EXISTS public.consultant_posts CASCADE;

-- 1) Enums ---------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.agentic_platform AS ENUM
    ('facebook','youtube','tiktok','instagram','telegram','x','linkedin','threads','podcast','newsletter','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agentic_revenue_source AS ENUM
    ('sponsored','affiliate','adsense','subscription','product','service','tips','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agentic_metric_type AS ENUM
    ('views','followers','revenue','engagement','posts','impressions','reach');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agentic_source AS ENUM ('manual','ocr','api','import');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agentic_autonomy AS ENUM ('advisor','semi_auto','full_auto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Channels -------------------------------------------------
CREATE TABLE public.agentic_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform public.agentic_platform NOT NULL,
  handle text,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agentic_channels_user ON public.agentic_channels(user_id, is_active);
ALTER TABLE public.agentic_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agentic_channels_owner" ON public.agentic_channels
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Daily metric snapshots (cumulative) ---------------------
CREATE TABLE public.agentic_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.agentic_channels(id) ON DELETE CASCADE,
  captured_at date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Yangon')::date,
  followers integer,
  total_views bigint,
  posts_count integer,
  engagement_rate numeric(6,3),
  impressions bigint,
  reach bigint,
  source public.agentic_source NOT NULL DEFAULT 'manual',
  raw_payload jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, captured_at)
);
CREATE INDEX idx_agentic_snap_user_date ON public.agentic_metric_snapshots(user_id, captured_at DESC);
CREATE INDEX idx_agentic_snap_channel ON public.agentic_metric_snapshots(channel_id, captured_at DESC);
ALTER TABLE public.agentic_metric_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agentic_snap_owner" ON public.agentic_metric_snapshots
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) Posts ----------------------------------------------------
CREATE TABLE public.agentic_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.agentic_channels(id) ON DELETE CASCADE,
  posted_at date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Yangon')::date,
  title text NOT NULL,
  post_url text,
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  production_cost_mmk numeric(14,2) NOT NULL DEFAULT 0,
  production_minutes integer NOT NULL DEFAULT 0,
  ad_spend_mmk numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  source public.agentic_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agentic_posts_user_date ON public.agentic_posts(user_id, posted_at DESC);
CREATE INDEX idx_agentic_posts_channel ON public.agentic_posts(channel_id, posted_at DESC);
ALTER TABLE public.agentic_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agentic_posts_owner" ON public.agentic_posts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5) Revenue --------------------------------------------------
CREATE TABLE public.agentic_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid REFERENCES public.agentic_channels(id) ON DELETE SET NULL,
  related_post_id uuid REFERENCES public.agentic_posts(id) ON DELETE SET NULL,
  occurred_at date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Yangon')::date,
  source public.agentic_revenue_source NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'MMK',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agentic_rev_user_date ON public.agentic_revenue(user_id, occurred_at DESC);
ALTER TABLE public.agentic_revenue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agentic_rev_owner" ON public.agentic_revenue
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6) Goals ----------------------------------------------------
CREATE TABLE public.agentic_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid REFERENCES public.agentic_channels(id) ON DELETE CASCADE,
  metric_type public.agentic_metric_type NOT NULL,
  title text NOT NULL,
  target_value numeric(20,2) NOT NULL CHECK (target_value > 0),
  baseline_value numeric(20,2) NOT NULL DEFAULT 0,
  deadline date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agentic_goals_user ON public.agentic_goals(user_id, status);
ALTER TABLE public.agentic_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agentic_goals_owner" ON public.agentic_goals
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7) Anomalies ------------------------------------------------
CREATE TABLE public.agentic_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid REFERENCES public.agentic_channels(id) ON DELETE CASCADE,
  metric_type public.agentic_metric_type NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  observed numeric(20,2),
  expected numeric(20,2),
  delta_pct numeric(8,2),
  explanation text,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agentic_anom_user ON public.agentic_anomalies(user_id, detected_at DESC);
ALTER TABLE public.agentic_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agentic_anom_owner" ON public.agentic_anomalies
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8) Agent action audit log ----------------------------------
CREATE TABLE public.agentic_agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agentic_actions_user ON public.agentic_agent_actions(user_id, created_at DESC);
ALTER TABLE public.agentic_agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agentic_actions_owner" ON public.agentic_agent_actions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9) User settings (autonomy + onboarding) -------------------
CREATE TABLE public.agentic_user_settings (
  user_id uuid PRIMARY KEY,
  autonomy public.agentic_autonomy NOT NULL DEFAULT 'semi_auto',
  default_currency text NOT NULL DEFAULT 'MMK',
  hourly_rate_mmk numeric(14,2) NOT NULL DEFAULT 0,
  onboarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agentic_user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agentic_settings_owner" ON public.agentic_user_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 10) Touch triggers -----------------------------------------
DROP TRIGGER IF EXISTS trg_agentic_channels_touch ON public.agentic_channels;
CREATE TRIGGER trg_agentic_channels_touch BEFORE UPDATE ON public.agentic_channels
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_agentic_snap_touch ON public.agentic_metric_snapshots;
CREATE TRIGGER trg_agentic_snap_touch BEFORE UPDATE ON public.agentic_metric_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_agentic_posts_touch ON public.agentic_posts;
CREATE TRIGGER trg_agentic_posts_touch BEFORE UPDATE ON public.agentic_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_agentic_rev_touch ON public.agentic_revenue;
CREATE TRIGGER trg_agentic_rev_touch BEFORE UPDATE ON public.agentic_revenue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_agentic_goals_touch ON public.agentic_goals;
CREATE TRIGGER trg_agentic_goals_touch BEFORE UPDATE ON public.agentic_goals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_agentic_settings_touch ON public.agentic_user_settings;
CREATE TRIGGER trg_agentic_settings_touch BEFORE UPDATE ON public.agentic_user_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 11) RPC: dashboard summary ---------------------------------
CREATE OR REPLACE FUNCTION public.agentic_dashboard_summary(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_views bigint := 0;
  v_engagement bigint := 0;
  v_followers bigint := 0;
  v_revenue numeric := 0;
  v_cost numeric := 0;
  v_ad_spend numeric := 0;
  v_posts int := 0;
  v_by_platform jsonb;
  v_trend jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT COALESCE(SUM(views),0), COALESCE(SUM(likes+comments+shares+saves),0),
         COALESCE(SUM(production_cost_mmk),0), COALESCE(SUM(ad_spend_mmk),0),
         COUNT(*)
    INTO v_views, v_engagement, v_cost, v_ad_spend, v_posts
    FROM agentic_posts
    WHERE user_id = v_user AND posted_at BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(amount),0) INTO v_revenue FROM agentic_revenue
    WHERE user_id = v_user AND occurred_at BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(followers),0) INTO v_followers FROM (
    SELECT DISTINCT ON (channel_id) channel_id, followers
    FROM agentic_metric_snapshots
    WHERE user_id = v_user AND captured_at <= p_to
    ORDER BY channel_id, captured_at DESC
  ) latest;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_by_platform FROM (
    SELECT c.platform,
      COALESCE(SUM(p.views),0) AS views,
      COALESCE(SUM(p.likes+p.comments+p.shares+p.saves),0) AS engagement,
      (SELECT COALESCE(SUM(amount),0) FROM agentic_revenue r
        WHERE r.user_id = v_user AND r.channel_id = c.id AND r.occurred_at BETWEEN p_from AND p_to) AS revenue
    FROM agentic_channels c
    LEFT JOIN agentic_posts p ON p.channel_id = c.id AND p.posted_at BETWEEN p_from AND p_to
    WHERE c.user_id = v_user
    GROUP BY c.id, c.platform
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) INTO v_trend FROM (
    SELECT posted_at AS day,
      SUM(views) AS views,
      SUM(likes+comments+shares+saves) AS engagement
    FROM agentic_posts
    WHERE user_id = v_user AND posted_at BETWEEN p_from AND p_to
    GROUP BY posted_at
  ) t;

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'views', v_views, 'engagement', v_engagement, 'followers', v_followers,
    'revenue', v_revenue, 'production_cost', v_cost, 'ad_spend', v_ad_spend,
    'total_cost', v_cost + v_ad_spend,
    'net', v_revenue - v_cost - v_ad_spend,
    'roi_pct', CASE WHEN (v_cost + v_ad_spend) > 0
      THEN ROUND(((v_revenue - v_cost - v_ad_spend) / (v_cost + v_ad_spend) * 100)::numeric, 2) ELSE NULL END,
    'posts', v_posts,
    'by_platform', v_by_platform,
    'trend', v_trend
  );
END $$;
GRANT EXECUTE ON FUNCTION public.agentic_dashboard_summary(date,date) TO authenticated;

-- 12) RPC: forecast (linear regression) ----------------------
CREATE OR REPLACE FUNCTION public.agentic_forecast(
  p_metric text, p_channel_id uuid, p_horizon_days int DEFAULT 30, p_lookback_days int DEFAULT 60
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_metric text := lower(coalesce(p_metric,'views'));
  v_history jsonb;
  v_slope numeric;
  v_intercept numeric;
  v_n int;
  v_forecast jsonb;
  v_stddev numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_metric NOT IN ('views','followers','revenue','engagement') THEN v_metric := 'views'; END IF;

  -- build daily series
  IF v_metric = 'revenue' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb), count(*)
    INTO v_history, v_n FROM (
      SELECT occurred_at AS day, SUM(amount)::numeric AS value
      FROM agentic_revenue
      WHERE user_id = v_user
        AND (p_channel_id IS NULL OR channel_id = p_channel_id)
        AND occurred_at >= CURRENT_DATE - p_lookback_days
      GROUP BY occurred_at
    ) t;
  ELSIF v_metric = 'followers' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb), count(*)
    INTO v_history, v_n FROM (
      SELECT captured_at AS day, SUM(followers)::numeric AS value
      FROM agentic_metric_snapshots
      WHERE user_id = v_user
        AND (p_channel_id IS NULL OR channel_id = p_channel_id)
        AND captured_at >= CURRENT_DATE - p_lookback_days
      GROUP BY captured_at
    ) t;
  ELSE
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb), count(*)
    INTO v_history, v_n FROM (
      SELECT posted_at AS day,
        CASE WHEN v_metric='engagement' THEN SUM(likes+comments+shares+saves) ELSE SUM(views) END::numeric AS value
      FROM agentic_posts
      WHERE user_id = v_user
        AND (p_channel_id IS NULL OR channel_id = p_channel_id)
        AND posted_at >= CURRENT_DATE - p_lookback_days
      GROUP BY posted_at
    ) t;
  END IF;

  -- regression on day-index
  IF v_n >= 3 THEN
    SELECT regr_slope(value, idx), regr_intercept(value, idx), stddev_samp(value)
      INTO v_slope, v_intercept, v_stddev
      FROM (
        SELECT (e->>'value')::numeric AS value,
               row_number() OVER ()::int AS idx
        FROM jsonb_array_elements(v_history) e
      ) s;
  ELSE
    v_slope := 0; v_intercept := 0; v_stddev := 0;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) INTO v_forecast FROM (
    SELECT (CURRENT_DATE + i)::date AS day,
           GREATEST(0, COALESCE(v_intercept,0) + COALESCE(v_slope,0) * (v_n + i))::numeric AS forecast,
           GREATEST(0, COALESCE(v_intercept,0) + COALESCE(v_slope,0) * (v_n + i) - COALESCE(v_stddev,0))::numeric AS lower,
           (COALESCE(v_intercept,0) + COALESCE(v_slope,0) * (v_n + i) + COALESCE(v_stddev,0))::numeric AS upper
    FROM generate_series(1, p_horizon_days) i
  ) t;

  RETURN jsonb_build_object(
    'metric', v_metric, 'channel_id', p_channel_id,
    'history', v_history, 'forecast', v_forecast,
    'slope', v_slope, 'intercept', v_intercept, 'stddev', v_stddev, 'n', v_n
  );
END $$;
GRANT EXECUTE ON FUNCTION public.agentic_forecast(text,uuid,int,int) TO authenticated;

-- 13) RPC: top posts -----------------------------------------
CREATE OR REPLACE FUNCTION public.agentic_top_posts(p_metric text, p_from date, p_to date, p_limit int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_metric text := lower(coalesce(p_metric,'views'));
  v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_metric NOT IN ('views','likes','comments','shares','saves','reach','engagement') THEN
    v_metric := 'views';
  END IF;

  EXECUTE format($f$
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT p.id, p.title, p.post_url, p.posted_at, c.platform,
             p.views, p.likes, p.comments, p.shares, p.saves, p.reach,
             (p.likes+p.comments+p.shares+p.saves) AS engagement,
             p.production_cost_mmk, p.ad_spend_mmk
      FROM agentic_posts p
      JOIN agentic_channels c ON c.id = p.channel_id
      WHERE p.user_id = %L AND p.posted_at BETWEEN %L AND %L
      ORDER BY %I DESC NULLS LAST
      LIMIT %s
    ) t
  $f$, v_user, p_from, p_to, v_metric, p_limit) INTO v_rows;

  RETURN jsonb_build_object('metric', v_metric, 'rows', v_rows);
END $$;
GRANT EXECUTE ON FUNCTION public.agentic_top_posts(text,date,date,int) TO authenticated;

-- 14) RPC: goal progress -------------------------------------
CREATE OR REPLACE FUNCTION public.agentic_goal_progress()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows FROM (
    SELECT g.id, g.title, g.metric_type::text, g.target_value, g.baseline_value, g.deadline, g.status,
      CASE g.metric_type
        WHEN 'revenue' THEN (
          SELECT COALESCE(SUM(amount),0) FROM agentic_revenue r
          WHERE r.user_id = v_user
            AND (g.channel_id IS NULL OR r.channel_id = g.channel_id)
            AND r.occurred_at <= g.deadline
            AND r.occurred_at >= g.created_at::date
        )
        WHEN 'views' THEN (
          SELECT COALESCE(SUM(views),0) FROM agentic_posts p
          WHERE p.user_id = v_user
            AND (g.channel_id IS NULL OR p.channel_id = g.channel_id)
            AND p.posted_at >= g.created_at::date
            AND p.posted_at <= g.deadline
        )
        WHEN 'engagement' THEN (
          SELECT COALESCE(SUM(likes+comments+shares+saves),0) FROM agentic_posts p
          WHERE p.user_id = v_user
            AND (g.channel_id IS NULL OR p.channel_id = g.channel_id)
            AND p.posted_at >= g.created_at::date
            AND p.posted_at <= g.deadline
        )
        WHEN 'followers' THEN (
          SELECT COALESCE(SUM(followers),0) FROM (
            SELECT DISTINCT ON (channel_id) channel_id, followers
            FROM agentic_metric_snapshots
            WHERE user_id = v_user
              AND (g.channel_id IS NULL OR channel_id = g.channel_id)
            ORDER BY channel_id, captured_at DESC
          ) latest
        )
        ELSE 0
      END AS current_value
    FROM agentic_goals g
    WHERE g.user_id = v_user AND g.status = 'active'
    ORDER BY g.deadline
  ) t;

  RETURN jsonb_build_object('goals', v_rows);
END $$;
GRANT EXECUTE ON FUNCTION public.agentic_goal_progress() TO authenticated;