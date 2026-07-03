// ═══ P0 UPGRADE: Tool Result Cache ═══
// Session-scoped cache for tool results to prevent redundant re-execution.
// Uses content-hash keys (tool name + stringified args) with 5-minute TTL.

interface CachedToolResult {
  result: any;
  timestamp: number;
  hitCount: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (default)
// Volatile reads (finance/tasks) — short TTL to limit stale-read window
// when user mutates data via UI outside of tool calls.
const VOLATILE_TTL_MS = 60 * 1000; // 60s
const VOLATILE_TOOLS = new Set(['manage_flowstate', 'manage_workspace_task']);
const MAX_CACHE_SIZE = 50;

function ttlForTool(toolName: string): number {
  return VOLATILE_TOOLS.has(toolName) ? VOLATILE_TTL_MS : CACHE_TTL_MS;
}

// Tool names that should NEVER be cached (side-effectful or time-sensitive)
const NON_CACHEABLE_TOOLS = new Set([
  'generate_image',
  'generate_ai_content',
  'manage_flowstate',       // Financial mutations
  'manage_workspace_task',  // Task mutations
  'update_agent_settings',
  'remember_user_fact',
  'save_user_fact',
  'spawn_sub_agent',
  'spawn_parallel_swarm',
  'manage_notifications',
  'manage_facebook_page',
  'create_skill',
  'update_my_instructions',
  'manage_ai_content',      // delete/save mutations
]);

// Actions within tools that ARE cacheable (read-only actions)
const CACHEABLE_ACTIONS: Record<string, Set<string>> = {
  'manage_flowstate': new Set(['get_balance', 'get_insights', 'list_recent', 'list_subscriptions']),
  'manage_workspace_task': new Set(['list', 'get_status', 'get_leaderboard']),
  'manage_ai_content': new Set(['count', 'list', 'get']),
  'manage_notifications': new Set(['check', 'list']),
  'manage_facebook_page': new Set(['get_posts', 'get_comments', 'get_page_info', 'list_pages']),
};

export class ToolResultCache {
  private cache = new Map<string, CachedToolResult>();
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Generate a deterministic hash key for a tool call.
   */
  private generateKey(toolName: string, args: Record<string, any>): string {
    // Sort keys for deterministic hashing
    const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
    return `${toolName}:${sortedArgs}`;
  }

  /**
   * Check if a tool call is cacheable based on tool name and action.
   */
  isCacheable(toolName: string, args: Record<string, any>): boolean {
    // If tool has cacheable actions defined, check the action
    if (CACHEABLE_ACTIONS[toolName]) {
      const action = args?.action;
      return action ? CACHEABLE_ACTIONS[toolName].has(action) : false;
    }
    // Otherwise, non-cacheable tools are blocked
    return !NON_CACHEABLE_TOOLS.has(toolName);
  }

  /**
   * Get a cached result if available and not expired.
   */
  get(toolName: string, args: Record<string, any>): any | null {
    if (!this.isCacheable(toolName, args)) return null;

    const key = this.generateKey(toolName, args);
    const cached = this.cache.get(key);
    
    if (!cached) return null;

    // Check TTL (volatile tools have shorter TTL)
    const ttl = ttlForTool(toolName);
    if (Date.now() - cached.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }

    cached.hitCount++;
    console.log(`[ToolCache] HIT for ${toolName} (hits: ${cached.hitCount}, age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
    return cached.result;
  }

  /**
   * Store a tool result in the cache.
   */
  set(toolName: string, args: Record<string, any>, result: any): void {
    if (!this.isCacheable(toolName, args)) return;
    
    // Don't cache errors
    if (result?.error || result?.success === false) return;

    const key = this.generateKey(toolName, args);

    // Evict oldest entries if at capacity
    if (this.cache.size >= MAX_CACHE_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.cache) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      hitCount: 0,
    });
    console.log(`[ToolCache] SET for ${toolName} (cache size: ${this.cache.size})`);
  }

  /**
   * Invalidate all cache entries for a specific tool.
   */
  invalidate(toolName: string): void {
    const prefix = `${toolName}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  /**
   * Invalidate related caches when a mutation tool runs.
   * E.g., after manage_flowstate:add_income, invalidate get_balance cache.
   */
  invalidateRelated(toolName: string): void {
    const MUTATION_INVALIDATION_MAP: Record<string, string[]> = {
      'manage_flowstate': ['manage_flowstate', 'get_user_info'],
      'manage_workspace_task': ['manage_workspace_task'],
      'manage_ai_content': ['manage_ai_content', 'search_knowledge_base'],
      'manage_facebook_page': ['manage_facebook_page'],
    };
    const toInvalidate = MUTATION_INVALIDATION_MAP[toolName];
    if (toInvalidate) {
      for (const t of toInvalidate) this.invalidate(t);
      console.log(`[ToolCache] Invalidated related caches for mutation: ${toolName}`);
    }
  }

  /**
   * Get cache statistics for diagnostics.
   */
  getStats(): { size: number; tools: string[] } {
    const tools = new Set<string>();
    for (const key of this.cache.keys()) {
      tools.add(key.split(':')[0]);
    }
    return { size: this.cache.size, tools: [...tools] };
  }

  /**
   * Clear entire cache (e.g., on session end).
   */
  clear(): void {
    this.cache.clear();
  }
}
