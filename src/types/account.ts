export interface JwtPayload {
  email?: string;
  name?: string;
  picture?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  [key: string]: unknown;
}

export interface AccountInfo {
  hasToken: boolean;
  email: string | null;
  name: string | null;
  picture: string | null;
  expiry?: string | null;
}

export interface SavedAccount {
  email: string;
  name: string;
  picture: string | null;
  expiry: string | null;
  lastUpdated?: string;
  updatedAt?: string;
  isActive: boolean;
}
