import { describe, expect, it } from "vitest";
import { hasSupabaseBackend } from "@/integrations/supabase/client";

describe("Supabase runtime guard", () => {
  it("requires both an explicit URL and publishable key before allowing cloud calls", () => {
    expect(hasSupabaseBackend(undefined, undefined)).toBe(false);
    expect(hasSupabaseBackend("http://127.0.0.1:54321", undefined)).toBe(false);
    expect(hasSupabaseBackend(undefined, "placeholder")).toBe(false);
    expect(hasSupabaseBackend("https://project.supabase.co", "publishable-key")).toBe(true);
  });
});
