// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildLivenessPayload, buildReadinessPayload } from '../../../../src/utils/healthCheck';

describe('KrakenBridge-Web Health Contract (/healthz & /readyz)', () => {
  it('returns fast 200 liveness payload', () => {
    const fixedDate = new Date('2026-10-29T21:00:00.000Z');
    const payload = buildLivenessPayload(fixedDate);
    expect(payload).toEqual({
      status: 'ok',
      timestamp: '2026-10-29T21:00:00.000Z',
    });
  });

  it('returns 200 ok when workspace is accessible and not draining, without leaking paths', () => {
    const res = buildReadinessPayload({
      workspaceDir: '/secret/internal/workspace',
      isDraining: false,
      checkWorkspaceAccess: () => true,
    });
    expect(res.httpCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.workspace.status).toBe('ok');
    expect(res.body.checks.podDrain.draining).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('/secret/internal/workspace');
  });

  it('returns 200 degraded when Pod Drain is active', () => {
    const res = buildReadinessPayload({
      workspaceDir: '/workspace',
      isDraining: true,
      checkWorkspaceAccess: () => true,
    });
    expect(res.httpCode).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.podDrain.status).toBe('degraded');
    expect(res.body.checks.podDrain.draining).toBe(true);
  });

  it('returns 503 down when workspace directory is inaccessible', () => {
    const res = buildReadinessPayload({
      workspaceDir: '/missing',
      isDraining: false,
      checkWorkspaceAccess: () => false,
    });
    expect(res.httpCode).toBe(503);
    expect(res.body.status).toBe('down');
    expect(res.body.checks.workspace.status).toBe('down');
  });
});
