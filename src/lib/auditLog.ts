import { supabase } from "@/integrations/supabase/client";

/**
 * Get client IP address (best effort)
 */
async function getClientIP(): Promise<string | null> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json().catch(() => ({} as { ip?: string }));
    return data.ip ?? null;
  } catch {
    return null;
  }
}

/**
 * Log an admin action to the audit log
 */
export async function logAdminAction(
  action: string,
  resourceType?: string,
  resourceId?: string,
  details?: Record<string, any>
) {
  try {
    const ipAddress = await getClientIP();
    const userAgent = navigator.userAgent;

    const { error } = await supabase.rpc('log_admin_action', {
      p_action: action,
      p_resource_type: resourceType || null,
      p_resource_id: resourceId || null,
      p_details: details ? JSON.stringify(details) : null,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });

    if (error) {
      console.error('Failed to log admin action:', error);
    }
  } catch (error) {
    console.error('Error logging admin action:', error);
  }
}

/**
 * Fetch audit logs with optional filters
 */
export async function fetchAuditLogs(
  filters?: {
    adminUserId?: string;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
) {
  let query = supabase
    .from('admin_audit_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.adminUserId) {
    query = query.eq('admin_user_id', filters.adminUserId);
  }

  if (filters?.action) {
    query = query.eq('action', filters.action);
  }

  if (filters?.resourceType) {
    query = query.eq('resource_type', filters.resourceType);
  }

  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate.toISOString());
  }

  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate.toISOString());
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  } else {
    query = query.limit(100);
  }

  return query;
}
