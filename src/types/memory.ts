export interface MemoryStatus {
  online: boolean;
  serverUrl: string;
  webUrl: string;
  dataDir: string;
  authenticated: boolean;
  version?: string;
  stats?: {
    pagesLatest?: number;
    pagesAllVersions?: number;
    sessions?: number;
    observations?: number;
    rawText?: string;
  };
  error?: string;
}

export interface MemorySearchResult {
  title: string;
  path: string;
  snippet?: string;
  score?: number;
  updatedAt?: string;
}

export interface MemoryPage {
  path: string;
  title: string;
  content: string;
  updatedAt?: string;
}

export interface MemoryHandoff {
  id: string;
  title: string;
  status: 'open' | 'claimed' | 'cancelled' | string;
  createdAt: string;
  authorAgent?: string;
  targetAgent?: string;
  summary: string;
}
