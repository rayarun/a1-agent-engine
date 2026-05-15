import logging
import os
import psycopg2
from temporalio import activity

DB_URL = os.getenv("POSTGRES_URL", "postgresql://postgres:postgres@localhost:5432/agentplatform")


@activity.defn
async def record_cost_event(tenant_id: str, agent_id: str, tokens_in: int, tokens_out: int, sandbox_ms: int) -> None:
    """Record token usage and cost event to the database."""
    logging.info(f"Recording cost event: tenant_id={tenant_id}, agent_id={agent_id}, tokens_in={tokens_in}, tokens_out={tokens_out}")

    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO cost_events (time, tenant_id, agent_id, tokens_in, tokens_out, sandbox_ms)
            VALUES (NOW(), %s, %s, %s, %s, %s)
            """,
            (tenant_id, agent_id, tokens_in, tokens_out, sandbox_ms)
        )

        conn.commit()
        cur.close()
        conn.close()
        logging.info(f"Cost event recorded successfully")
    except Exception as e:
        logging.error(f"Failed to record cost event: {e}")
        # Don't re-raise — cost tracking shouldn't break the workflow
