---
description: Kimu Video Editor - Core Architecture & AI Routing Guide
---

# Kimu Video Editor - AI Agent Routing Guide

**CRITICAL INSTRUCTION FOR AI AGENTS:**
This project is highly modular. Do **NOT** attempt to guess implementation details. You **MUST** read the specific sub-module documentation in the `.github/skills/video-editor/` folder based on the user's request before planning or executing code changes.

## 🏗️ Core Architecture Overview & Hierarchies

The Kimu Video Editor is designed as a multi-level hierarchical tree, ensuring strict **decoupling** and high **cohesion**. The system is divided into 3 primary parts (nodes), each managing a specific domain.

### 🌳 Architecture Tree

*   **Root: `video-editor`** (The entire application environment)
    *   ├── **Node 1: Frontend (`/app`)**
        *   *Role:* User Interface, Client State Management, & Media Preview
        *   *Tech Profile:* React 19, React Router 7, Remotion Player
        *   *Cohesion:* High. Strictly manages user-facing interactions and in-browser preview timelines.
        *   *Sub-nodes:*
            *   ├── `/components`: UI layout and shared React components
            *   ├── `/hooks`: React context, state management, and timeline logic
            *   ├── `/routes`: Application views and page routing
            *   └── `/video-compositions`: Remotion compositions optimized for real-time preview
    *   ├── **Node 2: VideoRender Engine (`/app/videorender`)**
        *   *Role:* Remotion Renderer & Video Export Service
        *   *Tech Profile:* Node.js, Remotion, tsx
        *   *Cohesion:* High. Dedicated strictly to processing video composition data into exportable formats (e.g., MP4).
        *   *Decoupling:* Independent from the Frontend UI loop. Designed to only accept instructions for rendering.
        *   *Sub-nodes:*
            *   └── `/videorender.ts`: Core rendering engine and execution entry point
    *   └── **Node 3: AI Backend (`/backend`)**
        *   *Role:* AI Logic, Prompt Engineering, & AI Video Agent
        *   *Tech Profile:* Python, FastAPI, Gemini 2.5 Flash
        *   *Cohesion:* High. Exclusively handles AI interpretation of commands to mutate the timeline or generate content.
        *   *Decoupling:* Fully decoupled from video rendering and UI state. Exposes API endpoints for the Frontend to consume.
        *   *Sub-nodes:*
            *   ├── `main.py`: AI Service entry point and API server
            *   ├── `schema.py`: AI data structures and validation schemas
            *   └── `tools_registry.py`: Gemini tool definitions for AI features

## 🚀 How to Start the Project

To run the project locally, you must spin up all three architectural nodes. Open three separate terminal instances from the root directory and run:

1. **Start the Frontend (App)**
   ```bash
   pnpm run dev
   ```

2. **Start the VideoRender Engine**
   ```bash
   pnpm dlx tsx app/videorender/videorender.ts
   ```

3. **Start the AI Backend (Python)**
   ```bash
   cd backend && .venv/Scripts/activate && python main.py
   ```

## 🚦 AI Context Router (3-Level Hierarchy)

To maximize performance and precision, this repository uses a **3-Level Context Hierarchy** for AI Agents. This ensures you only read the specific, smaller documentation files needed for a task rather than one massive README.

*   **Level 1 (Root):** You are here (`root-readme.md`), the central navigation hub.
*   **Level 2 (Sub-Domain Routers):** Files below linking to specific systems (e.g., Frontend, VideoRender, AI Backend).
*   **Level 3 (Feature Docs):** Deep dives into specific feature implementations, which you will find linked inside the Level 2 routers.

Based on the task, choose the relevant **Level 2 Sub-Domain Router** below:

*   **For a general system overview and how services connect:** 👉 [architecture-overview.md](./architecture-overview.md)
*   **For React UI, state management, or hooks:** 👉 [frontend-readme.md](./frontend-readme.md)
*   **For timeline logic, scrubbers, tracks, or data structures:** 👉 [timeline-readme.md](./timeline-readme.md)
*   **For VideoRender engine, file uploads, MP4 exports:** 👉 [backend-readme.md](./backend-readme.md)
*   **For AI logic, prompt engineering, Gemini tools:** 👉 [ai-backend-readme.md](./ai-backend-readme.md)
*   **For database schema, SQL queries, or data relationships:** 👉 [database-readme.md](./database-readme.md)
*   **For login flows, Google OAuth, or Better Auth sessions:** 👉 [auth-readme.md](./auth-readme.md)
*   **For Docker configs, Nginx, or environment variables:** 👉 [deployment-readme.md](./deployment-readme.md)

## General Rules
1. Never make cross-service assumptions. The Frontend and VideoRender engine share some directory paths but operate independently from the Python AI backend.
2. The Database is PostgreSQL, accessed via standard database layers dependent on the service.
3. Media rendering (Remotion) logic is strictly split: preview happens in the Frontend Node, offline rendering/export operations happen in the VideoRender Engine Node.
