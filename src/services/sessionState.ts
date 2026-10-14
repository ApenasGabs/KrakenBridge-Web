import type { ChildProcess } from 'child_process';
import type { ActiveSession } from '../types/chat.js';

export const activeProcesses = new Map<string, ChildProcess>();
export const activeSessions = new Map<string, ActiveSession>();

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function isSessionActive(conversationId: string): boolean {
  return activeSessions.has(conversationId);
}

export function getActiveSession(conversationId: string): ActiveSession | undefined {
  return activeSessions.get(conversationId);
}

export function registerActiveSession(conversationId: string, session: ActiveSession): void {
  activeSessions.set(conversationId, session);
  if (session.child) {
    activeProcesses.set(conversationId, session.child);
  }
}

export function unregisterActiveSession(conversationId: string): void {
  activeSessions.delete(conversationId);
  activeProcesses.delete(conversationId);
}
