export type SqliteValue = string | number | bigint | null | Uint8Array;

export interface SqliteRunResult {
  changes?: number;
  lastInsertRowid?: number | bigint;
}

export interface SqliteStatement {
  all(...params: SqliteValue[]): unknown[];
  get(...params: SqliteValue[]): unknown | undefined;
  run(...params: SqliteValue[]): SqliteRunResult;
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  transaction?<T>(fn: () => T): () => T;
}
