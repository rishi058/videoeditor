## Database Schema

The PostgreSQL database contains three primary tables:

| Table | Purpose |
| --- | --- |
| `projects` | Stores timeline state, composition settings |
| `assets` | Tracks uploaded media files with metadata |
| `sessions` | Manages authentication sessions (Better Auth) |

**Environment Variable**: `DATABASE_URL` must be configured in `.env` with a PostgreSQL connection string.

## External Dependencies

| Service | Purpose | Configuration |
| --- | --- | --- |
| Google OAuth | User authentication | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Gemini AI API | Natural language processing | `GEMINI_API_KEY` |
| Supabase (optional) | Additional backend features | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

## Project Structure

The repository is organized as a monorepo with the following key directories:

| Directory | Contents |
| --- | --- |
| `app/` | Frontend React application and routes |
| `app/videorender/` | Backend Express server for video rendering |
| `backend/` | FastAPI Python service for AI features |
| `out/` | Media file storage directory |

**Build Configuration**:

* Frontend: React Router 7 with Vite bundling
* Backend: TypeScript with tsx execution
* FastAPI: Python 3.13 with uv package management

### Shared Database Access

All three services access the same PostgreSQL database with a shared schema:

**Key Tables:**

* `user`: User accounts and authentication data
* `session`: Active user sessions
* `account`: OAuth provider linkage
* `projects`: Video editing projects
* `assets`: Media files metadata (video, audio, image)

**Connection Method:** Each service connects independently using the `DATABASE_URL` environment variable.

**Sources:** docker-compose.yml23-64 README.md138-140

### File System Sharing

The `out/` directory is mounted as a shared volume accessible to:

* **Backend**: Writes rendered videos and uploaded media
* **Frontend**: Reads media for serving via authenticated API endpoints

**Storage Structure:**

```
out/
├── media/          # Uploaded user media
├── renders/        # Rendered video outputs
└── temp/           # Temporary processing files
```

**Sources:** docker-compose.yml54 nginx.conf77-80

### Database Schema

The PostgreSQL database uses a schema designed for Better Auth integration plus custom video editing tables:

```
has

has

owns

contains

user

text

id

PK

text

name

text

email

boolean

emailVerified

text

image

timestamp

createdAt

timestamp

updatedAt

session

text

id

PK

timestamp

expiresAt

text

token

timestamp

createdAt

timestamp

updatedAt

text

ipAddress

text

userAgent

text

userId

FK

account

projects

serial

id

PK

text

user_id

FK

text

name

jsonb

timeline

timestamp

created_at

timestamp

updated_at

assets

serial

id

PK

text

user_id

FK

integer

project_id

FK

text

filename

text

type

integer

size

text

url

jsonb

metadata

timestamp

created_at
```

**Sources:** README.md138-140

#### Data Schema Architecture

The service uses Pydantic models for robust type validation:

```
BaseSchema  
model_config extra='ignore'

TextProperties  
textContent, fontSize, fontFamily

BaseScrubber  
id, mediaType, urls, dimensions

MediaBinItem  
+ name, durationInSeconds

ScrubberState  
+ left, y, width, player props

TrackState  
id, scrubbers[]

TimelineState  
tracks[]

UniversalToolCall  
function_name, arguments

FunctionCallResponse  
function_call OR assistant_message
```

The `extra="ignore"` configuration allows the backend to accept richer frontend objects without validation errors.

**Sources:** backend/schema.py1-77

### AI Processing Pipeline

#### Endpoint: `POST /ai`

The primary AI endpoint accepts rich editor context and returns either a function call or an assistant message.

**Request Schema:**

```
class Message(BaseModel):

message: str                                 # User's natural language input

mentioned_scrubber_ids: list[str] | None    # @ mentions of assets

timeline_state: dict[str, Any] | None       # Current timeline state

mediabin_items: list[dict[str, Any]] | None # Available media assets

chat_history: list[dict[str, Any]] | None   # Previous conversation turns
```

**Response Schema:**

```
class FunctionCallResponse(BaseModel):

function_call: UniversalToolCall | None      # Action to execute

assistant_message: str | None                # Text response or clarification
```

**Sources:** backend/main.py34-44 backend/schema.py56-77

#### Processing Flow Diagram

```
_second_pass_force_tool()gemini-2.5-flash_normalize_time_fields_from_text()/aiChat Interface_second_pass_force_tool()gemini-2.5-flash_normalize_time_fields_from_text()/aiChat InterfaceBuild prompt with:- Tools catalog- Timeline state- Media bin items- Conversation historyalt[Response has function_call][Response is assistant_message only]POST /ai{message, context, history}generate_content()response_schema + toolsJSON responseNormalize time fieldsExtract "from 2s to 12s"Updated argumentsFunctionCallResponse{function_call}Re-prompt for tool callForce tool selectionfunction_call or nullForced responseFunctionCallResponse
```

**Sources:** backend/main.py206-401

### PostgreSQL Database

Both services connect to PostgreSQL via `DATABASE_URL` environment variable. The database stores:

* **Projects:** Timeline state snapshots
* **Assets:** Media file metadata (filename, type, duration, dimensions)
* **Sessions:** User authentication sessions (managed by Better Auth)
* **Users:** Account information

The database is **not containerized** in the Docker Compose setup, suggesting it runs as a managed service (e.g., Supabase, RDS).

**Sources:** Diagram 7 from high-level architecture

### File System: `out/` Directory

A shared Docker volume mounted to both backend containers:

```
out/
├── uploaded_media_files.mp4
├── uploaded_images.jpg
├── audio_tracks.mp3
└── TimelineComposition.mp4  (rendered output)
```

**Ownership:**

* **Node.js backend:** Writes uploads, reads for Remotion composition, writes rendered videos
* **FastAPI backend:** (Read-only access implied, not directly used)

**Security:** All file operations use path validation utilities (`safeResolveOutPath`, `createSafeFilename`) to prevent directory traversal attacks.

**Sources:** app/videorender/videorender.ts8-48

## Inter-Service Communication

The services operate **independently** with no direct HTTP communication between them. Communication patterns:

| Flow | Path | Method |
| --- | --- | --- |
| Frontend → Node.js Backend | Nginx → `/render/*` → Port 8000 | POST, GET, DELETE |
| Frontend → FastAPI Backend | Nginx → `/ai/api/*` → Port 3000 | POST |
| Node.js → PostgreSQL | Direct connection via `DATABASE_URL` | SQL queries |
| FastAPI → PostgreSQL | Direct connection via `DATABASE_URL` | SQL queries |
| Remotion → Node.js Backend | Internal `http://localhost:8000/media/:filename` | GET |

**Deployment Note:** In production, the services communicate over the Docker bridge network. Nginx blocks external access to `/media/*` endpoints, allowing only internal Remotion composition access.

**Sources:** app/videorender/videorender.ts68-91 Diagram 1 from high-level architecture

## Health Monitoring

### Database Persistence

PostgreSQL is **not containerized** in this architecture. The database connection is specified via the `DATABASE_URL` environment variable, which typically points to a managed database service (e.g., AWS RDS, Supabase, or self-hosted PostgreSQL).

**Source:** docker-compose.yml23-44 (env\_file references)

This separation allows for:

* **Independent scaling** of database resources
* **Managed backups** through database provider
* **High availability** configurations without Docker Compose complexity

### Message Input Schema

The `/ai` endpoint accepts a `Message` object containing:

| Field | Type | Description |
| --- | --- | --- |
| `message` | `str` | User's natural language command |
| `mentioned_scrubber_ids` | `list[str] | None` | IDs of timeline elements mentioned via '@' syntax |
| `timeline_state` | `dict[str, Any] | None` | Current timeline structure with tracks and scrubbers |
| `mediabin_items` | `list[dict[str, Any]] | None` | Available media assets |
| `chat_history` | `list[dict[str, Any]] | None` | Previous conversation turns |

### Processing Pipeline

```
Second PassTime NormalizerGemini API/ai POSTFrontendSecond PassTime NormalizerGemini API/ai POSTFrontendBuild response_schema(lines 228-271)alt[Tool call extracted][Still no tool]alt[Response contains function_call][Response is assistant_message only]POST /ai{message, timeline_state, mediabin_items, ...}generate_content()model: gemini-2.5-flashwith tools catalog{function_call: {function_name, arguments}}_postprocess_response()_normalize_time_fields_from_text()Normalized function_callFunctionCallResponse{assistant_message: "..."}_second_pass_force_tool()Re-prompt for tool call{function_call: {...}}Normalize timesNormalized function_callFunctionCallResponseNone{assistant_message: "..."}
```

### Response Schema Definition

The AI service defines a strict JSON schema for Gemini's structured output backend/main.py228-271:

```
{

"type": "object",

"properties": {

"function_call": {

"type": "object",

"properties": {

"function_name": {"type": "string"},

"arguments": {

"type": "object",

"properties": {

"scrubber_id": {"type": "string"},

"track_number": {"type": "integer"},

"start_seconds": {"type": "number"},

"duration_seconds": {"type": "number"},

// ... other parameters

}

}

},

"required": ["function_name"]

},

"assistant_message": {"type": "string"}

}

}
```

## Data Schemas

### Core Models

The system uses Pydantic v2 models with `extra="ignore"` configuration to remain compatible with frontend payloads that may contain additional fields.

#### BaseSchema

```
class BaseSchema(BaseModel):

model_config = ConfigDict(extra="ignore")
```

All AI-related schemas inherit from `BaseSchema` backend/schema.py6-9

#### UniversalToolCall

```
class UniversalToolCall(BaseSchema):

function_name: str  # Name of the tool to execute

arguments: dict[str, Any] | None  # Tool-specific parameters
```

This is the "V2 universal tool-call envelope" that allows extensibility without code changes backend/schema.py57-66

#### FunctionCallResponse

```
class FunctionCallResponse(BaseSchema):

function_call: UniversalToolCall | None = None

assistant_message: str | None = None
```

The top-level response structure backend/schema.py68-76 Exactly one of the two fields should be populated.

# Database Connection

DATABASE_URL=postgresql://username:password@localhost:5432/videoeditor

### Session Storage Schema

The `sessions` table in PostgreSQL stores:

* Session identifier
* User ID
* Creation timestamp
* Expiration timestamp
* Additional metadata

## Authentication State Schema

User data is normalized using a Zod schema to handle varying response structures from Better Auth.

### AuthUser Interface

app/hooks/useAuth.ts7-12

```
interface AuthUser {

id: string;

email?: string | null;

name?: string | null;

image?: string | null;

}
```

#### Request Schema: `Message`

The request payload accepts flexible editor context along with the user's message.

```
class Message(BaseModel):

model_config = ConfigDict(extra="ignore")

message: str  # User's natural language command

mentioned_scrubber_ids: list[str] | None = None  # @-mentioned asset IDs

timeline_state: dict[str, Any] | None = None  # Current timeline state

mediabin_items: list[dict[str, Any]] | None = None  # Available media

chat_history: list[dict[str, Any]] | None = None  # Prior conversation turns
```

**Key behaviors:**

* The model config uses `extra="ignore"` to accept additional fields without validation errors
* All context fields are optional but recommended for better AI accuracy
* `mentioned_scrubber_ids` captures assets referenced with `@` syntax in the UI
* `chat_history` format: `[{"role": "user"|"assistant", "content": "..."}]`

**Sources:** backend/main.py34-43

#### Response Schema: `FunctionCallResponse`

The response is a Pydantic model that contains either a function call or an assistant message, but not both simultaneously.

```
class FunctionCallResponse(BaseSchema):

function_call: UniversalToolCall | None = None

assistant_message: str | None = None

class UniversalToolCall(BaseSchema):

function_name: str  # Tool to execute (e.g., "AddMediaByName")

arguments: dict[str, Any] | None = None  # Tool-specific arguments
```

**Response patterns:**

| Scenario | Response Content |
| --- | --- |
| Clear, executable command | `function_call` with `function_name` and `arguments` |
| Ambiguous request | `assistant_message` asking for clarification |
| Informational query | `assistant_message` with explanation |
| After second pass | Either `function_call` (success) or original `assistant_message` |

**Sources:** backend/schema.py57-76

## Database Migrations

The project uses a custom migration system defined in app/lib/migrate.ts1-200 To run migrations:

```
pnpm run migrate
```

This script:

1. Connects to PostgreSQL using `DATABASE_URL`
2. Creates the `public.schema_migrations` table if it doesn't exist
3. Executes pending SQL migrations from app/lib/db.ts1-200
4. Records completed migrations in the tracking table

**Migration Structure:**
Migrations are defined as objects with `id`, `name`, and `sql` properties. The system tracks which migrations have been applied to avoid re-running them.

**Sources:** package.json10

## Service Interconnections

The three services communicate through HTTP APIs and share database access:

```
FastAPI :3000

Backend :8000

Frontend :5173

POST /render

POST /api/assets/upload

POST /ai/api/ai

React Router App  
react-router dev

Custom Hooks:  
useRenderer  
useMediaBin  
useTimeline

Express Server  
tsx videorender.ts

@remotion/renderer  
renderMedia()

Asset Upload Handler  
multer middleware

FastAPI App  
uv run main.py

Gemini AI Client  
process_ai_message

PostgreSQL  
DATABASE_URL
```

**API Communication:**

* Frontend calls Backend at `/render` for video generation
* Frontend calls Backend at `/api/assets/*` for media management
* Frontend calls FastAPI at `/ai/api/*` for AI features
* All services share the same PostgreSQL database

**Development Considerations:**

* CORS is configured to allow cross-origin requests in development
* In production, Nginx routes requests to appropriate services
* Services can be developed and tested independently

**Sources:** README.md70-77 High-level system diagrams

## Development Workflow Summary

1. **Start Services**: Use Docker Compose or run each service individually
2. **Make Changes**: Edit files in `app/` or `backend/` directories
3. **Hot Reload**: Changes are automatically reloaded in development mode
4. **Type Checking**: Run `pnpm run typecheck` before committing
5. **Linting**: Run `pnpm run lint` to check for code issues
6. **Formatting**: Run `pnpm run format` to auto-fix style issues
7. **Testing**: Access services at their respective ports (5173, 8000, 3000)

For detailed information about specific development tasks, refer to the child pages listed at the beginning of this document.

**Sources:** package.json6-14 README.md59-106

## Getting Started

This page provides instructions for setting up the Kimu Video Editor codebase for local development. It covers dependency installation, environment configuration, and running the multi-service architecture in development mode. For production deployment instructions, see [Infrastructure and Deployment](./deployment-readme.md). For understanding the overall system architecture before diving into setup, see [System Architecture](./architecture-overview.md).

## Prerequisites

The following software must be installed on your development machine before proceeding:

| Requirement | Minimum Version | Purpose |
| --- | --- | --- |
| **Node.js** | 20.x | Frontend and backend (video rendering) runtime |
| **pnpm** | Latest | Package manager for JavaScript dependencies |
| **Python** | 3.9+ | AI backend service (FastAPI) |
| **uv** | Latest | Python package manager (recommended) |
| **PostgreSQL** | 12+ | Database for projects, assets, sessions |
| **Docker** (optional) | Latest | Containerized development environment |
| **FFmpeg** | Latest | Video encoding (automatically installed by Remotion) |

**Sources:** README.md97-106

## Installation

### 1. Clone the Repository

```
git clone 

cd videoeditor
```

### 2. Install JavaScript Dependencies

The project uses `pnpm` for dependency management. Install all frontend and backend (Node.js) dependencies:

```
pnpm install --frozen-lockfile
```

This installs dependencies declared in package.json16-64 including:

* `react-router` (v7.12.0) - Frontend framework
* `@remotion/renderer` (v4.0.329) - Video rendering engine
* `better-auth` (v1.4.5) - Authentication library
* `express` (v5.1.0) - Backend HTTP server
* `pg` (v8.12.0) - PostgreSQL client

**Sources:** package.json1-115 README.md86-87

### 3. Install Python Dependencies

For the FastAPI service, use `uv` (recommended) or `pip`:

```
# Using uv (recommended)

cd backend

uv install

# OR using pip

pip install -r backend/requirements.txt
```

The FastAPI service requires the Gemini AI SDK and other Python dependencies for natural language processing.

**Sources:** README.md92

## Running Services

### Development Mode (Local)

You must run all three services in separate terminal sessions. Each service must complete its startup sequence before the system is fully operational.

## Database Setup

The application requires a PostgreSQL database. You must create the database and run migrations before first use.

### 1. Create Database

```
createdb videoeditor

# OR using psql

psql -c "CREATE DATABASE videoeditor;"
```

### 2. Run Migrations

* Executes app/lib/migrate.ts using `tsx` (package.json10)
* Creates tables: `users`, `sessions`, `projects`, `assets`
* Sets up indexes and foreign key constraints
* **Database URL:** Read from `DATABASE_URL` environment variable

**Sources:** package.json10 README.md139

## Verification Steps

After starting all services, verify the system is operational:

### 4. Database Connection

Check logs for successful database connections:

```
# For local services

# Check terminal output for "Connected to PostgreSQL"

### PostgreSQL Connection Refused

**Symptom:** "ECONNREFUSED" or "could not connect to server"

**Solution:** Verify PostgreSQL is running and `DATABASE_URL` is correct

```
# Test connection manually

psql $DATABASE_URL -c "SELECT 1;"
```

## Data Relationships and Dependencies

This diagram shows the inheritance and composition relationships between the core types:

```
BaseScrubber  
Core media properties

MediaBinItem  
+ name  
+ upload tracking

ScrubberState  
+ timeline position  
+ player properties

ScrubberState[]

Transition

Transition[]

TrackState

TrackState[]

TimelineState

TextProperties  
Text styling

getTimelineData()

TimelineDataItem  
Render-ready format
```

**Sources:** app/components/timeline/types.ts1-107

