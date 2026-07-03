
-- ════════════════════════════════════════════════════════════
-- AgentConsultant — Strategy Consultant data layer
-- ════════════════════════════════════════════════════════════

-- 1) Posts ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultant_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL DEFAULT 'facebook'
    CHECK (platform IN ('facebook','instagram','tiktok','youtube','x','linkedin','threads','other')),
  post_url text,
  post_name text NOT NULL,
  posted_at date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Yangon')::date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultant_posts_user ON public.consultant_posts(user_id, posted_at DESC);
ALTER TABLE public.consultant_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consultant_posts_owner_all" ON public.consultant_posts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2) Daily metrics (one row per post per date) ----------------
CREATE TABLE IF NOT EXISTS public.consultant_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.consultant_posts(id) ON DELETE CASCADE,
  metric_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Yangon')::date,
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_consultant_metrics_user_date ON public.consultant_post_metrics(user_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_consultant_metrics_post ON public.consultant_post_metrics(post_id, metric_date DESC);
ALTER TABLE public.consultant_post_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consultant_metrics_owner_all" ON public.consultant_post_metrics
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Finance entries ------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultant_finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Yangon')::date,
  entry_type text NOT NULL CHECK (entry_type IN ('expense','income')),
  category text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'MMK',
  related_post_id uuid REFERENCES public.consultant_posts(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultant_finance_user_date ON public.consultant_finance_entries(user_id, entry_date DESC);
ALTER TABLE public.consultant_finance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consultant_finance_owner_all" ON public.consultant_finance_entries
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) Touch updated_at -----------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_consultant_posts_touch ON public.consultant_posts;
CREATE TRIGGER trg_consultant_posts_touch BEFORE UPDATE ON public.consultant_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_consultant_metrics_touch ON public.consultant_post_metrics;
CREATE TRIGGER trg_consultant_metrics_touch BEFORE UPDATE ON public.consultant_post_metrics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_consultant_finance_touch ON public.consultant_finance_entries;
CREATE TRIGGER trg_consultant_finance_touch BEFORE UPDATE ON public.consultant_finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) Insights RPCs --------------------------------------------
CREATE OR REPLACE FUNCTION public.consultant_dashboard_summary(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_total_posts int;
  v_views bigint;
  v_likes bigint;
  v_comments bigint;
  v_shares bigint;
  v_engagement bigint;
  v_spend numeric;
  v_revenue numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT count(*) INTO v_total_posts FROM consultant_posts WHERE user_id = v_user;

  SELECT
    COALESCE(SUM(views),0), COALESCE(SUM(likes),0), COALESCE(SUM(comments),0),
    COALESCE(SUM(shares),0), COALESCE(SUM(likes+comments+shares+saves),0)
  INTO v_views, v_likes, v_comments, v_shares, v_engagement
  FROM consultant_post_metrics
  WHERE user_id = v_user AND metric_date BETWEEN p_from AND p_to;

  SELECT
    COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN entry_type='income'  THEN amount ELSE 0 END),0)
  INTO v_spend, v_revenue
  FROM consultant_finance_entries
  WHERE user_id = v_user AND entry_date BETWEEN p_from AND p_to;

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'total_posts', v_total_posts,
    'views', v_views, 'likes', v_likes, 'comments', v_comments, 'shares', v_shares,
    'engagement', v_engagement,
    'spend', v_spend, 'revenue', v_revenue,
    'net', v_revenue - v_spend,
    'roi_pct', CASE WHEN v_spend > 0 THEN ROUND(((v_revenue - v_spend) / v_spend * 100)::numeric, 2) ELSE NULL END
  );
END $$;

CREATE OR REPLACE FUNCTION public.consultant_post_leaderboard(p_metric text, p_from date, p_to date, p_limit int DEFAULT 10)
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
      SELECT p.id, p.post_name, p.platform, p.post_url,
             SUM(m.views) AS views, SUM(m.likes) AS likes, SUM(m.comments) AS comments,
             SUM(m.shares) AS shares, SUM(m.saves) AS saves, SUM(m.reach) AS reach,
             SUM(m.likes + m.comments + m.shares + m.saves) AS engagement
      FROM consultant_posts p
      JOIN consultant_post_metrics m ON m.post_id = p.id
      WHERE p.user_id = %L AND m.metric_date BETWEEN %L AND %L
      GROUP BY p.id
      ORDER BY %I DESC NULLS LAST
      LIMIT %s
    ) t
  $f$, v_user, p_from, p_to, v_metric, p_limit) INTO v_rows;

  RETURN jsonb_build_object('metric', v_metric, 'from', p_from, 'to', p_to, 'rows', v_rows);
END $$;

CREATE OR REPLACE FUNCTION public.consultant_finance_summary(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_by_cat jsonb;
  v_by_day jsonb;
  v_spend numeric; v_revenue numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT
    COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN entry_type='income'  THEN amount ELSE 0 END),0)
  INTO v_spend, v_revenue
  FROM consultant_finance_entries
  WHERE user_id = v_user AND entry_date BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_by_cat FROM (
    SELECT category, entry_type, SUM(amount) AS amount
    FROM consultant_finance_entries
    WHERE user_id = v_user AND entry_date BETWEEN p_from AND p_to
    GROUP BY category, entry_type
    ORDER BY amount DESC
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_by_day FROM (
    SELECT entry_date,
      SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END) AS spend,
      SUM(CASE WHEN entry_type='income'  THEN amount ELSE 0 END) AS revenue
    FROM consultant_finance_entries
    WHERE user_id = v_user AND entry_date BETWEEN p_from AND p_to
    GROUP BY entry_date
    ORDER BY entry_date
  ) t;

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'spend', v_spend, 'revenue', v_revenue,
    'net', v_revenue - v_spend,
    'roi_pct', CASE WHEN v_spend > 0 THEN ROUND(((v_revenue - v_spend) / v_spend * 100)::numeric, 2) ELSE NULL END,
    'by_category', v_by_cat,
    'by_day', v_by_day
  );
END $$;

GRANT EXECUTE ON FUNCTION public.consultant_dashboard_summary(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultant_post_leaderboard(text,date,date,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultant_finance_summary(date,date) TO authenticated;
