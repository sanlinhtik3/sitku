// Helper utilities for Easy SRT feature

/**
 * Format bytes to human readable file size
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "Unknown";
  
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Estimate processing time based on video duration
 * Rough estimate: 30-60 seconds processing per minute of video
 */
export function estimateProcessingTime(durationSecs: number | null | undefined): string {
  if (!durationSecs) return "Unknown";
  
  // Estimate: ~45 seconds processing per minute of video
  const estimatedMins = Math.ceil((durationSecs / 60) * 0.75);
  
  if (estimatedMins < 1) return "< 1 min";
  if (estimatedMins === 1) return "~1 min";
  return `~${estimatedMins} mins`;
}

/**
 * Get status display info
 */
export function getStatusInfo(status: string): { label: string; labelMm: string; color: string } {
  switch (status) {
    case "completed":
      return { label: "Completed", labelMm: "ပြီးဆုံးပြီ", color: "green" };
    case "failed":
      return { label: "Failed", labelMm: "မအောင်မြင်ပါ", color: "red" };
    case "pending":
      return { label: "Pending", labelMm: "စောင့်ဆိုင်းနေသည်", color: "gray" };
    default:
      return { label: "Processing", labelMm: "ပြုလုပ်နေသည်", color: "amber" };
  }
}

/**
 * Format token count with thousand separators
 */
export function formatTokens(tokens?: number | null): string {
  if (!tokens || tokens === 0) return "0";
  return tokens.toLocaleString();
}

/**
 * Format cost estimate to USD with appropriate precision
 */
export function formatCost(cost?: number | null): string {
  if (!cost || cost === 0) return "$0.00";
  
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format processing time in milliseconds to human-readable format
 */
export function formatProcessingTime(ms?: number | null): string {
  if (!ms || ms === 0) return "N/A";
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}
