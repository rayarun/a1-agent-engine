# Copyright 2026 Arun Ray
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Direct (non-Temporal) agent executor.
Runs agents as in-process Python tasks with in-memory session state.
Bypass Skill Dispatcher for lightweight, fast execution.
"""

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class AgentSession:
    """In-memory session state for a direct agent execution."""

    id: str
    agent_id: str
    tenant_id: str
    messages: List[dict] = field(default_factory=list)
    events: List[dict] = field(default_factory=list)
    state: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    expires_at: float = field(default_factory=lambda: time.time() + 3600)  # 1 hour TTL
    last_activity: float = field(default_factory=time.time)

    def get_new_events(self, since_index: int = 0) -> List[dict]:
        """Return events since last poll."""
        return self.events[since_index:]

    def add_event(self, event_type: str, **kwargs) -> None:
        """Add event to session."""
        event = {"type": event_type, "timestamp": time.time(), **kwargs}
        self.events.append(event)
        self.last_activity = time.time()

    def is_expired(self) -> bool:
        """Check if session has expired."""
        return time.time() > self.expires_at

    def is_idle(self, idle_timeout: int = 300) -> bool:
        """Check if session has been idle too long (5 min default)."""
        return time.time() - self.last_activity > idle_timeout


class DirectAgentExecutor:
    """
    Execute agents directly without Temporal.
    Manages in-memory session state and coordinates tool execution.
    """

    def __init__(self, max_sessions: int = 100):
        self.sessions: Dict[str, AgentSession] = {}
        self.max_sessions = max_sessions
        self.cleanup_task = None
        # Cleanup task started lazily when event loop is available

    def _ensure_cleanup_task(self) -> None:
        """Start background cleanup task if not already running."""
        if self.cleanup_task is None:
            try:
                loop = asyncio.get_running_loop()
                self.cleanup_task = loop.create_task(self._cleanup_expired_sessions())
            except RuntimeError:
                # No event loop running yet (synchronous context)
                pass

    async def _cleanup_expired_sessions(self) -> None:
        """Periodically clean up expired sessions."""
        while True:
            try:
                await asyncio.sleep(60)  # Check every minute
                now = time.time()
                expired_ids = [
                    sid
                    for sid, sess in self.sessions.items()
                    if sess.is_expired() or sess.is_idle()
                ]
                for sid in expired_ids:
                    logger.info(f"[CLEANUP] Removing expired session {sid}")
                    del self.sessions[sid]
            except Exception as e:
                logger.error(f"Cleanup task error: {e}")

    def get_or_create_session(
        self, agent_id: str, tenant_id: str, session_id: Optional[str] = None
    ) -> AgentSession:
        """Get existing session or create new one."""
        self._ensure_cleanup_task()  # Start cleanup if event loop available

        if session_id and session_id in self.sessions:
            session = self.sessions[session_id]
            session.last_activity = time.time()
            return session

        # Create new session
        if len(self.sessions) >= self.max_sessions:
            # Remove oldest idle session
            oldest = min(
                self.sessions.values(),
                key=lambda s: s.last_activity,
            )
            logger.warning(
                f"[SESSIONS] Max sessions reached, removing oldest: {oldest.id}"
            )
            del self.sessions[oldest.id]

        new_id = str(uuid.uuid4())
        session = AgentSession(
            id=new_id, agent_id=agent_id, tenant_id=tenant_id
        )
        self.sessions[new_id] = session
        logger.info(f"[SESSION] Created new session {new_id} for agent {agent_id}")
        return session

    def get_session(self, session_id: str, tenant_id: str) -> Optional[AgentSession]:
        """Retrieve session by ID, validating tenant ownership."""
        session = self.sessions.get(session_id)
        if session and session.tenant_id == tenant_id:
            session.last_activity = time.time()
            return session
        return None

    async def execute_iteration(
        self,
        session: AgentSession,
        context: dict,
        framework_executor,  # Direct Anthropic agent executor
    ) -> dict:
        """
        Execute one iteration of agent reasoning.

        Args:
            session: Agent session
            context: Agent context (model, system_prompt, etc.)
            framework_executor: Framework-specific executor (e.g., DirectAnthropicAgent)

        Returns:
            {
                "session_id": str,
                "events": list[dict],
                "final_answer": str or None,
                "continue_loop": bool,
            }
        """
        try:
            # Call framework executor for one reasoning step
            result = await framework_executor.execute_step(session, context)

            # Emit events from result
            if "final_answer" in result and result["final_answer"]:
                session.add_event("final_answer", content=result["final_answer"])
                return {
                    "session_id": session.id,
                    "events": session.get_new_events(),
                    "final_answer": result["final_answer"],
                    "continue_loop": False,
                }

            if "tool_calls" in result:
                for tool_call in result["tool_calls"]:
                    session.add_event("tool_call", name=tool_call["name"])

            if "continue_loop" in result:
                return {
                    "session_id": session.id,
                    "events": session.get_new_events(),
                    "continue_loop": result["continue_loop"],
                }

            return {
                "session_id": session.id,
                "events": session.get_new_events(),
                "continue_loop": True,
            }
        except Exception as e:
            logger.error(f"Execution iteration failed: {e}")
            session.add_event("error", message=str(e))
            return {
                "session_id": session.id,
                "events": session.get_new_events(),
                "continue_loop": False,
                "error": str(e),
            }

    async def stream_events(self, session_id: str, tenant_id: str, timeout: int = 300):
        """
        Stream events from a session (async generator).
        Yields events as they become available; blocks until timeout.
        """
        session = self.get_session(session_id, tenant_id)
        if not session:
            yield json.dumps({"type": "error", "message": "Session not found"})
            return

        start_time = time.time()
        last_event_count = len(session.events)

        while time.time() - start_time < timeout:
            current_event_count = len(session.events)
            if current_event_count > last_event_count:
                # New events available
                for event in session.events[last_event_count:]:
                    yield json.dumps(event)
                last_event_count = current_event_count

            if session.state.get("finished"):
                # Agent finished, stop streaming
                break

            # Poll every 100ms
            await asyncio.sleep(0.1)

        if not session.state.get("finished"):
            yield json.dumps(
                {
                    "type": "timeout",
                    "message": f"No activity for {timeout} seconds",
                }
            )
