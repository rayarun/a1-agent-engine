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

const STORAGE_PREFIX = "chat-session:";
const cache = new Map<string, Message[]>();

export function getSession(agentId: string): Message[] {
  if (!cache.has(agentId)) {
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + agentId);
      cache.set(agentId, raw ? JSON.parse(raw) : []);
    } catch {
      cache.set(agentId, []);
    }
  }
  return cache.get(agentId)!;
}

export function setSession(agentId: string, messages: Message[]): void {
  cache.set(agentId, messages);
  try {
    sessionStorage.setItem(STORAGE_PREFIX + agentId, JSON.stringify(messages));
  } catch {
    // sessionStorage full or unavailable — in-memory cache still works
  }
}

export function clearSession(agentId: string): void {
  cache.delete(agentId);
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + agentId);
  } catch {}
}
