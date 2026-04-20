# Agent Studio Design Document

## Overview
Agent Studio is the visual frontend for the Agentic AI Platform. it serves as the command center for users to build, manage, and simulate AI agents. It abstracts the complex YAML manifest creation into a developer-friendly UI.

## Architecture
Agent Studio is a Next.js application that interacts primarily with the Platform Gateway (API Gateway) for persistence and workflow triggers.

### Key Interactions
- **Manifest Registry**: Fetches and updates agent manifests.
- **Skill Catalog**: Browses and manages reusable tools and skills.
- **Execution Trace Visualizer**: Queries OpenTelemetry data (via the observability stack) to render execution DAGs of agent reasoning loops.

## Key Features
- **Visual Manifest Builder**: Drag-and-drop interface for defining agent logic (likely using React Flow).
- **Skill Management**: Interface for defining and testing tool schemas.
- **Agent Testing Simulator**: A playground to interact with agents in real-time before deployment.
- **Observability Dashboard**: Visualizes execution history and token usage.

## Technical Stack
- **Framework**: Next.js (React)
- **Styling**: Tailwind CSS
- **Interactions**: React Flow (for DAG visualization)
- **State Management**: React Query / SWR (for API fetching)

## Current Status
- [x] Next.js project structure initialized.
- [ ] Visual Builder implementation.
- [ ] API integration with Gateway.
- [ ] Observability dashboard.
