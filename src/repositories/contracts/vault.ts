export interface VaultInfo {
  name: string;
  path: string;
  active?: boolean;
  lastOpenedAt?: string;
  noteCount?: number;
}

export interface CreateVaultInput {
  name: string;
  parentPath?: string;
}

export interface OpenVaultInput {
  path?: string;
}

export interface VaultRepository {
  getActiveVault(): Promise<VaultInfo>;
  listVaults(): Promise<VaultInfo[]>;
  createVault(input: CreateVaultInput): Promise<VaultInfo | null>;
  openVault(input?: OpenVaultInput): Promise<VaultInfo | null>;
  switchVault(path: string): Promise<VaultInfo>;
  revealActiveVault(): Promise<void>;
  // Remove a vault from the Recent list (does not touch the folder on disk).
  forgetVault(path: string): Promise<void>;
}
