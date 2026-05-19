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

interface TimingEvent {
  name: string;
  timestamp: number;
  duration?: number;
}

interface TimingSession {
  sessionId: string;
  events: TimingEvent[];
  startTime: number;
}

const sessions = new Map<string, TimingSession>();

export function startTimingSession(sessionId: string): void {
  sessions.set(sessionId, {
    sessionId,
    events: [],
    startTime: performance.now(),
  });
  console.log(`[ChatTiming] Started session: ${sessionId}`);
}

export function recordTiming(sessionId: string, eventName: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    console.warn(`[ChatTiming] Session not found: ${sessionId}`);
    return;
  }

  const now = performance.now();
  const prevEvent = session.events[session.events.length - 1];
  const duration = prevEvent ? now - prevEvent.timestamp : now - session.startTime;

  session.events.push({
    name: eventName,
    timestamp: now,
    duration,
  });

  console.log(`[ChatTiming] ${eventName}: ${duration.toFixed(0)}ms (total: ${(now - session.startTime).toFixed(0)}ms)`);
}

export function endTimingSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    console.warn(`[ChatTiming] Session not found: ${sessionId}`);
    return;
  }

  const totalTime = performance.now() - session.startTime;
  console.group(`[ChatTiming] Session Summary: ${sessionId} (Total: ${totalTime.toFixed(0)}ms)`);

  session.events.forEach((event, idx) => {
    if (idx === 0) {
      console.log(`  ${event.name}: ${event.duration?.toFixed(0)}ms`);
    } else {
      const pct = ((event.duration ?? 0) / totalTime * 100).toFixed(1);
      console.log(`  ${event.name}: ${event.duration?.toFixed(0)}ms (${pct}%)`);
    }
  });

  console.groupEnd();
  sessions.delete(sessionId);
}

export function addTimingMetadataToMessage(sessionId: string, metadata: Record<string, unknown>): void {
  const session = sessions.get(sessionId);
  if (session && session.events.length > 0) {
    const lastEvent = session.events[session.events.length - 1];
    lastEvent.duration = (lastEvent.duration ?? 0) + (metadata.processingTime as number ?? 0);
  }
}
