CREATE TABLE public.telegram_processed_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tpu_processed_at ON public.telegram_processed_updates (processed_at);

ALTER TABLE public.telegram_processed_updates ENABLE ROW LEVEL SECURITY;