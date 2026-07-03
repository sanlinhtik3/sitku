export interface SettingsRepository {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  list(prefix?: string): Promise<Record<string, unknown>>;
}
