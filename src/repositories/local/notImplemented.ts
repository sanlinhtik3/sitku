function notImplemented(domain: string): never {
  throw new Error(domain + " local repository is not implemented yet. Wire this domain intentionally before using it.");
}

export function createNotImplementedRepository<T extends object>(domain: string): T {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "watchNotes") return () => ({ unsubscribe: () => {} });
      if (String(prop).startsWith("subscribe")) return () => ({ unsubscribe: () => {} });
      return () => notImplemented(domain);
    },
  }) as T;
}
