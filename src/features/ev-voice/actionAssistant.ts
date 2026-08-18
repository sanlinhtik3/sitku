export interface EvActionLogRecord {
  turnId: string;
  status: string;
  intent?: string;
  skill?: string;
  result?: string;
  reply?: string;
  error?: string;
  updatedAt?: string;
}

export interface EvActionDiagnostic {
  code: string;
  message: string;
  reason: string;
  recovery: string;
  retryable: boolean;
  action: string;
  skill: string;
  turnId: string;
}

export function diagnoseActionError(
  error: unknown,
  context: { action: string; skill: string; turnId: string },
): EvActionDiagnostic {
  const message = error instanceof Error ? error.message : String(error || "Unknown action error");
  const lower = message.toLowerCase();
  let code = "ACTION_EXECUTION_FAILED";
  let reason = "The Sitku action executor returned an unexpected error.";
  let recovery = "Review the exact error, correct the input or local service, then retry.";
  let retryable = true;

  const operatorCode = message.match(/\b(OPERATOR_[A-Z_]+)\b/)?.[1];
  const structuredCode = message.match(/\b(NO_WORKSPACE_CONTEXT|NO_ACTIVE_FILE|FILE_NOT_FOUND|AMBIGUOUS_TARGET|INVALID_INPUT|CONFLICT|CONTENT_CHANGED|PERMISSION_DENIED|ACTION_VERIFICATION_FAILED)\b/)?.[1];
  if (operatorCode) {
    code = operatorCode;
    reason = "The delegated E.V Operator did not complete successfully.";
    recovery = lower.includes("429") || lower.includes("quota")
      ? "Restore Gemini quota or billing, then start a new Operator turn."
      : "Review the Operator error and retry with a new turn when the provider is available.";
    retryable = !lower.includes("required");
  } else if (structuredCode) {
    code = structuredCode;
    retryable = structuredCode === "CONTENT_CHANGED";
    if (structuredCode === "AMBIGUOUS_TARGET") {
      reason = "More than one note matched the requested name.";
      recovery = "Choose one of the exact note paths listed in the error, then retry.";
    } else if (structuredCode === "CONFLICT") {
      reason = "The requested note path already exists.";
      recovery = "Choose a different note name or explicitly update the existing note.";
    } else if (structuredCode === "CONTENT_CHANGED") {
      reason = "The note changed after E.V captured it, so the write was stopped safely.";
      recovery = "Pause editing and approve the action again against the latest content.";
    } else if (structuredCode === "ACTION_VERIFICATION_FAILED") {
      reason = "The repository or workspace did not satisfy the action post-condition.";
      recovery = "Do not assume success. Review the workspace state and retry once.";
    } else {
      reason = message.split(":").slice(1).join(":").trim() || "The requested workspace action could not be completed.";
      recovery = structuredCode === "NO_WORKSPACE_CONTEXT"
        ? "Open the Notes workspace and retry."
        : structuredCode === "FILE_NOT_FOUND"
          ? "Provide the exact note title or path and retry."
          : "Correct the requested input and retry.";
    }
  } else if (lower.includes("not implemented") || lower.includes("unavailable")) {
    code = "CAPABILITY_UNAVAILABLE";
    reason = "This capability is not implemented by the active local repository.";
    recovery = "Use a supported capability or update the local repository implementation.";
    retryable = false;
  } else if (lower.includes("not found")) {
    code = "TARGET_NOT_FOUND";
    reason = "The requested note, task, or target could not be found.";
    recovery = "Ask for the available items or provide a more exact name.";
    retryable = false;
  } else if (lower.includes("database is locked") || lower.includes("sqlite_busy") || lower.includes("sqlite_locked")) {
    code = "STORAGE_BUSY";
    reason = "The local database was temporarily busy.";
    recovery = "Retry once after the current local write finishes.";
  } else if (lower.includes("permission") || lower.includes("denied")) {
    code = "PERMISSION_DENIED";
    reason = "The operating system or local runtime denied access.";
    recovery = "Restore the required permission, then retry.";
    retryable = false;
  } else if (lower.includes("required") || lower.includes("invalid")) {
    code = "INVALID_INPUT";
    reason = "The action did not receive all required valid data.";
    recovery = "Ask the user only for the missing value, then retry once.";
    retryable = false;
  }

  return { code, message, reason, recovery, retryable, ...context };
}

export function latestActionFailure(records: EvActionLogRecord[]): EvActionLogRecord | null {
  return records.find((record) => record.status === "failed" || record.status === "interrupted") || null;
}

export function failureExplanation(record: EvActionLogRecord | null) {
  if (!record) {
    return {
      result: "No failed E.V action was found in the recent journal.",
      reply: "Recent action log ထဲမှာ failed action မတွေ့ပါဘူး။",
    };
  }
  const action = record.intent || "unknown action";
  const message = record.error || "No error detail was recorded.";
  return {
    result: `Last failed action: ${action}. Reason: ${message}`,
    reply: `နောက်ဆုံး မအောင်မြင်တဲ့ action က ${action} ပါ။ အကြောင်းရင်းက ${message}`,
    log: record,
  };
}
