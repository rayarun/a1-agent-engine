import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker

# Placeholders for future activities and workflows
from workflows import AgentWorkflow

async def main():
    logging.basicConfig(level=logging.INFO)
    client = await Client.connect("localhost:7233")

    worker = Worker(
        client,
        task_queue="agent-task-queue",
        workflows=[AgentWorkflow],
        activities=[], # Register OpenAI activities here
    )
    logging.info("Starting Temporal Agent Worker...")
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
