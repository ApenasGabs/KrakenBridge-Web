export type UpdateStage =
  | 'idle'
  | 'draining'
  | 'fetching'
  | 'checking_out'
  | 'building_backend'
  | 'building_frontend'
  | 'restarting'
  | 'resumed'
  | 'error';

export interface EvolutionProgress {
  stage: UpdateStage;
  message: string;
  stepNumber: number;
  totalSteps: number;
  percent: number;
  targetTag?: string;
  error?: string;
}

export interface PendingReload {
  conversationId: string | null;
  taskDescription: string;
  rebuildFrontend: boolean;
  requestedAt: string;
}

export interface EvolutionState {
  active: boolean;
  status?: 'idle' | 'draining' | 'reloading' | 'resumed';
  isDraining: boolean;
  activeTasksCount: number;
  conversationId?: string | null;
  taskDescription?: string;
  rebuildFrontend?: boolean;
  triggeredAt?: string;
  pid?: number;
  activeTasksWhenTriggered?: number;
  drainedAt?: string;
  resumedAt?: string;
  resumedPid?: number;
  pendingReload?: PendingReload | null;
  progress?: EvolutionProgress;
  stepMessage?: string;
}

export interface TriggerReloadOptions {
  conversationId?: string;
  taskDescription?: string;
  rebuildFrontend?: boolean;
}

export interface TriggerReloadResult {
  success: boolean;
  status: 'draining' | 'reloading';
  activeTasksCount: number;
  message: string;
}
