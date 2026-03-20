# Kimu Video Editor - Technical Reference

## Overview

This document provides a high-level introduction to the Kimu Video Editor repository, explaining its purpose, architecture, and core technologies. Kimu is an open-source, AI-powered web-based video editing platform built as an alternative to proprietary tools like Capcut and Canva.

For detailed information about specific subsystems, see:

* System architecture and service communication: [System Architecture](./architecture-overview.md)
* Timeline editing implementation: [Timeline System](./timeline-readme.md)
* Video rendering with Remotion: [Video Composition and Rendering](./backend-readme.md)
* AI assistant capabilities: [AI Assistant](./ai-backend-readme.md) (Vibe AI))
* API specifications: [API Reference](./backend-readme.md)

The Assets API is implemented across two services:

* **Frontend API routes** (`/api/assets/*`) - Authenticated endpoints that interact with the database and coordinate with the backend service
* **Backend service endpoints** - File system operations and internal media serving for Remotion composition

All browser-facing asset operations require authentication and respect project ownership boundaries. Assets are associated with specific projects via the `projectId` foreign key.

**Key characteristics:**

* Optimistic UI upload with progress tracking
* Client-side metadata extraction before upload
* Server-side file storage with timestamp-based unique filenames
* Type-specific deletion strategies (text/grouped items vs. persisted media)
* Project-scoped asset isolation

Sources: app/hooks/useMediaBin.ts1-535 app/videorender/videorender.ts1-368

The AI API is a Python FastAPI service running on port 3000 that acts as an intermediary between the user interface and the Gemini AI model. It receives natural language editing commands along with full editor context (timeline state, media bin, chat history) and returns either a structured function call or an assistant message. The service implements sophisticated time expression parsing, a two-pass inference strategy, and automatic field normalization to ensure reliable command execution.

**Sources:** backend/main.py1-407

## Purpose and Scope

Kimu Video Editor is a full-stack web application that enables browser-based video editing with AI assistance. The platform supports multi-track timeline editing, real-time video preview, programmatic video rendering, and natural language editing commands. The system is designed for self-hosting with Docker deployment and includes authentication, cloud project persistence, and media asset management.

This document provides a high-level overview of the Kimu Video Editor's multi-service architecture, including service boundaries, communication patterns, data storage, and deployment model. This page focuses on the structural organization of the system components and how they interact.

For detailed information about specific subsystems:

* Frontend implementation details → see [Frontend Architecture](./frontend-readme.md)
* Backend service internals → see [Backend Services](./backend-readme.md)
* Deployment and infrastructure → see [Infrastructure and Deployment](./deployment-readme.md)

This document describes the media asset management system in Kimu Video Editor, including the media bin, file upload pipeline, metadata extraction, and asset lifecycle. The system is primarily implemented through the `useMediaBin` hook and handles various media types (video, image, audio, text) with optimistic UI patterns and progress tracking.

For information about how media assets are used in the timeline editor, see [Timeline System](./timeline-readme.md). For backend API endpoints related to asset management, see [Assets API](./backend-readme.md).

Kimu supports two distinct text-based features:

1. **Static Text Overlays** - User-created text elements with customizable styling (font, size, color, alignment) that can be placed on the timeline as scrubbers
2. **Animated Captions** - TikTok-style word-by-word captions with timing data, rendered using Remotion's caption system with multiple visual styles

This page documents the components, data structures, and rendering logic for both systems.

The AI Assistant service accepts user messages along with complete editor context (timeline state, media bin contents, chat history) and returns either:

* **Function calls**: Structured commands to modify the timeline (e.g., `add_media`, `trim_video`, `delete_scrubbers`)
* **Assistant messages**: Clarifying questions or explanatory responses when no action is appropriate

The system is built on Google's Gemini 2.5 Flash model and implements sophisticated time parsing to handle natural language expressions like "from 2s to 12s" or "make it 10 seconds long".

The Rendering API provides a single HTTP endpoint (`POST /render`) that converts timeline composition data into a downloadable video file. The endpoint accepts serialized timeline state from the frontend, bundles it with a Remotion composition, and executes server-side video rendering with optimized settings for production infrastructure (4vCPU, 8GB RAM).

The rendering process uses the same `TimelineComposition` component that powers real-time preview in the frontend, ensuring visual consistency between editing and final output.

This document describes the state management patterns and architecture used throughout the Kimu Video Editor frontend application. It covers the custom React hooks pattern, state mutation strategies, undo/redo implementation, optimistic UI updates, and server synchronization mechanisms. For detailed information about the TypeScript interfaces and data structures used within state, see [Data Types and Interfaces](./database-readme.md).

The Kimu application does not use a traditional global state management library (Redux, Zustand, MobX, etc.). Instead, it implements a **custom hooks-based architecture** where each domain of state is encapsulated in a specialized React hook, and these hooks are composed together in the main editor component.

