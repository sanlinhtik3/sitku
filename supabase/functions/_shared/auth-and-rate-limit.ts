// ═══ Auth & Rate Limiting Module ═══
// Extracted from agent-chat/index.ts for modularity.

// Rate limiting: 60 messages per minute for non-admin, unlimited for admin/owner
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60000;
const MAX_MAP_SIZE = 1000;

// ═══ PILLAR 1: Admin Cache (5-minute TTL, eliminates per-request DB roundtrip) ═══
const adminCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ═══ PILLAR 2: Periodic Eviction (prevents unbounded memory growth) ═══
const CLEANUP_INTERVAL_MS = 60_000; // 60 seconds

function cleanupStaleEntries(): void {
  const now = Date.now();

  // Evict expired admin cache entries
  for (const [key, entry] of adminCache) {
    if (now > entry.expiresAt) {
      adminCache.delete(key);
    }
  }

  // Evict expired rate limit windows
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }

  // Hard cap: if still over limit, evict oldest entries (LRU-style via insertion order)
  if (adminCache.size > MAX_MAP_SIZE) {
    const excess = adminCache.size - MAX_MAP_SIZE;
    const keys = adminCache.keys();
    for (let i = 0; i < excess; i++) {
      const { value } = keys.next();
      if (value) adminCache.delete(value);
    }
  }

  if (rateLimitMap.size > MAX_MAP_SIZE) {
    const excess = rateLimitMap.size - MAX_MAP_SIZE;
    const keys = rateLimitMap.keys();
    for (let i = 0; i < excess; i++) {
      const { value } = keys.next();
      if (value) rateLimitMap.delete(value);
    }
  }
}

// Start periodic cleanup (runs in background, non-blocking)
setInterval(cleanupStaleEntries, CLEANUP_INTERVAL_MS);

export function getCachedAdminStatus(userId: string): boolean | null {
  const cached = adminCache.get(userId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    adminCache.delete(userId);
    return null;
  }
  return cached.isAdmin;
}

export function setCachedAdminStatus(userId: string, isAdmin: boolean): void {
  adminCache.set(userId, { isAdmin, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS });
}

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_WINDOW_MS });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT) {
    return false;
  }
  
  userLimit.count++;
  return true;
}
