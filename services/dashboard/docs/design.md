# Platform Dashboard Design

## Overview
The Dashboard provides a human-centric window into the Agentic AI Platform, focusing on observability and manual agent interaction.

## Architecture
- **Technology**: Python 3.10 + Streamlit
- **Primary Role**: Real-time visualization of agent status and memory.

## Key Features
- **Agent Console**: An interactive playground to trigger agents and view their live status via polling.
- **Memory Explorer**: SQL integration with the `agent_memories` table to allow for knowledge inspection.
- **Health Monitoring**: High-level status overview of the microservice backend.

## Data Strategy
- **Triggering**: Communicates primarily with the `api-gateway` via the standard REST API.
- **Observability**: Polls the gateway status endpoints to transition from the "Thinking..." state to "Completed".
- **Database**: Direct read-only connection to the Postgres instance for memory exploration.
