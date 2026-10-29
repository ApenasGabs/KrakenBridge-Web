import fs from 'node:fs';

export interface LivenessPayload {
  status: 'ok';
  timestamp: string;
}

export interface ReadinessPayload {
  status: 'ok' | 'degraded' | 'down';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    workspace: {
      status: 'ok' | 'down';
    };
    podDrain: {
      status: 'ok' | 'degraded';
      draining: boolean;
    };
    memory: {
      rssMB: number;
      heapUsedMB: number;
    };
  };
}

export function buildLivenessPayload(now: Date = new Date()): LivenessPayload {
  return {
    status: 'ok',
    timestamp: now.toISOString(),
  };
}

export function buildReadinessPayload(options: {
  workspaceDir: string;
  isDraining: boolean;
  checkWorkspaceAccess?: (dir: string) => boolean;
  now?: Date;
}): { httpCode: 200 | 503; body: ReadinessPayload } {
  const checkAccess =
    options.checkWorkspaceAccess ??
    ((dir: string) => {
      try {
        fs.accessSync(dir, fs.constants.R_OK);
        return true;
      } catch {
        return false;
      }
    });

  const workspaceOk = checkAccess(options.workspaceDir);
  const mem = process.memoryUsage();

  let status: 'ok' | 'degraded' | 'down' = 'ok';
  let httpCode: 200 | 503 = 200;

  if (!workspaceOk) {
    status = 'down';
    httpCode = 503;
  } else if (options.isDraining) {
    status = 'degraded';
    httpCode = 200;
  }

  return {
    httpCode,
    body: {
      status,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: (options.now ?? new Date()).toISOString(),
      checks: {
        workspace: {
          status: workspaceOk ? 'ok' : 'down',
        },
        podDrain: {
          status: options.isDraining ? 'degraded' : 'ok',
          draining: options.isDraining,
        },
        memory: {
          rssMB: Math.round(mem.rss / (1024 * 1024)),
          heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
        },
      },
    },
  };
}
