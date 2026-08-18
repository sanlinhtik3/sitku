/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext } from "react";

/**
 * Pillar 4: "ClickUp's Isolation" — Fine-grained State Management via React Context.
 *
 * Eliminates monolithic scope hoisting, circular dependencies, and TDZ crashes ("Oo" TDZ crash)
 * by sharing workspace state cleanly across isolated domain rendering panels without prop drilling.
 */
export const WorkspaceShellContext = createContext<any>(null);
export const WorkspaceEditorContext = createContext<any>(null);
export const WorkspaceContext = WorkspaceShellContext;

export function useWorkspace(): any {
  const context = useContext(WorkspaceShellContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

export function useEditorWorkspace(): any {
  const context = useContext(WorkspaceEditorContext);
  if (!context) {
    throw new Error("useEditorWorkspace must be used within a WorkspaceEditorProvider");
  }
  return context;
}

export function reuseContextValue(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
  volatileKeys: ReadonlySet<string>,
): Record<string, unknown> {
  if (!previous) return next;
  const keys = Object.keys(next);
  const stable = keys.length === Object.keys(previous).length
    && keys.every((key) => volatileKeys.has(key) || previous[key] === next[key]);
  if (!stable) return next;
  for (const key of volatileKeys) previous[key] = next[key];
  return previous;
}
