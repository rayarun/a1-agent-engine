// Copyright 2026 Arun Ray
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Message } from "./types";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // Check every 1 minute

interface SessionData {
  messages: Message[];
  createdAt: number;
  lastActivityAt: number;
}

const cache = new Map<string, SessionData>();

// Start cleanup interval when module loads
startCleanupInterval();

function startCleanupInterval() {
  setInterval(() => {
    const now = Date.now();
    const expiredSessions: string[] = [];

    cache.forEach((session, agentId) => {
      if (now - session.lastActivityAt > IDLE_TIMEOUT_MS) {
        expiredSessions.push(agentId);
      }
    });

    expiredSessions.forEach((agentId) => {
      console.log(`[ChatCache] Cleared idle session for agent ${agentId}`);
      cache.delete(agentId);
    });
  }, CLEANUP_INTERVAL_MS);
}

export function getSession(agentId: string): Message[] {
  const session = cache.get(agentId);
  if (!session) {
    return [];
  }

  const now = Date.now();
  const isExpired = now - session.lastActivityAt > IDLE_TIMEOUT_MS;

  if (isExpired) {
    console.log(`[ChatCache] Session expired for agent ${agentId} (idle for ${Math.round((now - session.lastActivityAt) / 1000)}s)`);
    cache.delete(agentId);
    return [];
  }

  // Update activity on read
  session.lastActivityAt = now;
  return session.messages;
}

export function setSession(agentId: string, messages: Message[]): void {
  const now = Date.now();
  const session = cache.get(agentId);

  if (session) {
    session.messages = messages;
    session.lastActivityAt = now;
  } else {
    cache.set(agentId, {
      messages,
      createdAt: now,
      lastActivityAt: now,
    });
  }
}

export function clearSession(agentId: string): void {
  cache.delete(agentId);
}

export function getSessionIdleTime(agentId: string): number {
  const session = cache.get(agentId);
  if (!session) return 0;
  return Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - session.lastActivityAt));
}
