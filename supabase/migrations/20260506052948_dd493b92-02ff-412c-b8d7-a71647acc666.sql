SELECT cron.schedule(
  'cognitive-maintenance-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ixtcytrohsuapazvockm.supabase.co/functions/v1/cognitive-maintenance',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4dGN5dHJvaHN1YXBhenZvY2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExMzY1OTgsImV4cCI6MjA3NjcxMjU5OH0.X8kZ4P2QI1BVHbwyt6qrpB6st6W2lQqCuCNhJ8BQjv4"}'::jsonb,
    body := concat('{"trigger":"cron","at":"', now(), '"}')::jsonb
  );
  $$
);