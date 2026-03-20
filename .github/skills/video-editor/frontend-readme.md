### Frontend Stack

| Component | Technology | Purpose |
| --- | --- | --- |
| Framework | React 19 | UI rendering and component architecture |
| Routing | React Router 7 | Page navigation and route handling |
| Video Player | `@remotion/player` 4.0.329 | Real-time video preview |
| Video Composition | `remotion` 4.0.329 | Declarative video rendering |
| State Management | Custom hooks | Timeline, media, auth state |
| UI Components | Radix UI | Accessible component primitives |
| Styling | Tailwind CSS 4 | Utility-first styling |
| HTTP Client | `axios` 1.13.5 | API requests |
| Build Tool | Vite 7 | Development server and bundling |

### Frontend Hooks

| Hook | File Location | Purpose |
| --- | --- | --- |
| `useTimeline` | Frontend codebase | Manages timeline state, tracks, scrubbers, undo/redo |
| `useMediaBin` | Frontend codebase | Handles asset upload, deletion, metadata |
| `useRuler` | Frontend codebase | Manages playhead position and time navigation |
| `useRenderer` | Frontend codebase | Orchestrates video rendering requests |
| `useAuth` | Frontend codebase | Manages authentication state and sessions |

### Frontend Service

The frontend runs on **Node.js 20** using **React 19** with **React Router 7** for routing and server-side rendering. It serves as the primary application shell and handles:

* User interface rendering and interaction
* Authentication via Better Auth with Google OAuth
* Project and asset management APIs
* Real-time video preview using `@remotion/player`
* Session management and cookie handling

**Key Characteristics:**

* Framework: React Router 7 (SSR-capable)
* Port: 5173 (internal), exposed via Nginx
* Build: `pnpm run build` → production bundle
* Entry: package.json9 (`react-router dev` for development)

## Frontend Architecture

This document details the React-based frontend architecture of Kimu Video Editor, including routing structure, layout system, state management patterns, and component organization. For implementation details of specific features like timeline editing or media management, see [Timeline System](./timeline-readme.md), Media Management, and other feature-specific pages. For authentication mechanisms, see [Authentication and Security](./auth-readme.md).

## Overview and Technology Stack

The frontend is a single-page application (SPA) built with:

* **React 18** with TypeScript for component-based UI
* **React Router v7** for declarative routing and navigation
* **Custom React hooks** for state management (no Redux/MobX/Zustand)
* **Remotion** for programmatic video composition and preview
* **Tailwind CSS** with shadcn/ui components for styling
* **Vite** as the build tool and development server

The application runs on port `5173` in development and is served behind an Nginx reverse proxy in production at the root path (`/`).

**Sources:** app/root.tsx app/routes.ts app/routes/home.tsx1-60

## State Management Pattern

Kimu uses a **custom hooks-based state management** approach instead of global state libraries. This pattern encapsulates domain logic within hooks that return both state and operations.

### Core State Management Hooks

```
TimelineEditor Component  
app/routes/home.tsx

useTimeline  
Timeline state + operations

useMediaBin  
Media assets management

useRuler  
Playhead position tracking

useRenderer  
Video render orchestration

useAuth  
Session management

TimelineState  
tracks, scrubbers, transitions

MediaBinItem[]  
uploaded assets

rulerPositionPx  
playhead location

isRendering, renderStatus

user, isLoading
```

**Hook Responsibilities:**

| Hook | State Managed | Key Operations | Location |
| --- | --- | --- | --- |
| `useTimeline` | Timeline structure, zoom level, undo/redo stacks | Add/delete tracks, update scrubbers, split, group/ungroup, transitions | app/hooks/useTimeline.ts |
| `useMediaBin` | Media bin items, upload state, context menus | Upload files, add text, delete assets, split audio | app/hooks/useMediaBin.ts |
| `useRuler` | Ruler position in pixels, drag state | Drag ruler, sync with player, scroll timeline | app/hooks/useRuler.ts |
| `useRenderer` | Render job status, progress | Trigger render, stream output, handle errors | app/hooks/useRenderer.ts |
| `useAuth` | User session, loading states | Sign in with Google, sign out, session refresh | app/hooks/useAuth.ts |

**Sources:** app/routes/home.tsx115-182 app/hooks/useTimeline.ts18-27 app/hooks/useAuth.ts54-82

### useTimeline Hook Architecture

The `useTimeline` hook is the most complex state manager, implementing undo/redo functionality and timeline transformations:

**useTimeline Data Flow**

```
consumes

calls before mutation

React Component  
(TimelineEditor)

useTimeline Hook

timeline: TimelineState  
{tracks: TrackState[]}

zoomLevel, timelineWidth

undoStack, redoStack  
(in-memory only)

Timeline Operations

handleAddTrack()

handleUpdateScrubber()

handleDropOnTrack()

handleSplitScrubberAtRuler()

handleGroupScrubbers()

handleAddTransitionToTrack()

handleZoomIn/Out/Reset()

Transform Functions

getTimelineData()  
→ TimelineDataItem[]

expandTimeline()

getConnectedElements()

snapshotTimeline()  
Push to undoStack

undo() / redo()
```

**Undo/Redo Implementation:**

The hook maintains two stacks for undo/redo operations at app/hooks/useTimeline.ts33-36:

* Before any mutating operation (add, delete, update), `snapshotTimeline()` is called
* The current timeline state is deep-cloned and pushed to the `undoStack`
* Undo pops from `undoStack`, pushes current state to `redoStack`, and restores the popped state
* Redo reverses this operation
* History is capped at 100 states to prevent memory issues

The `isApplyingHistoryRef` flag at app/hooks/useTimeline.ts36 prevents undo/redo operations from creating new history entries.

**Sources:** app/hooks/useTimeline.ts18-73 app/hooks/useTimeline.ts279-337

### Frontend-Backend Communication Flow

```
"File System""PostgreSQL""Backend Service""apiUrl()""Hook (useMediaBin)""Component""File System""PostgreSQL""Backend Service""apiUrl()""Hook (useMediaBin)""Component"Optimistic UI updatewith temp UUIDhandleAddMediaToBin(file)apiUrl("/api/assets/upload")"http://localhost:8000/api/assets/upload"POST with FormDataWrite file to out/INSERT asset record{id, url, metadata}Replace temp ID with real IDUpdate state with remote URL
```

**Communication Characteristics:**

1. **Credentials:** All requests include `credentials: "include"` for cookie-based authentication
2. **Optimistic Updates:** Media uploads immediately appear in UI with local blob URLs before server confirmation
3. **Error Handling:** Failed requests trigger toast notifications via the `sonner` library
4. **Type Safety:** TypeScript interfaces ensure request/response contracts match backend

**Sources:** app/utils/api.ts29-34 Diagram 6 from high-level architecture

### Frontend Service

The **frontend container** (`videoeditor-frontend`) serves the React Router application with server-side rendering and handles authenticated asset delivery.

#### Container Specification

| Property | Value |
| --- | --- |
| Base Image | `node:20-bookworm-slim` |
| Container Name | `videoeditor-frontend` |
| Build Context | `.` (repository root) |
| Dockerfile | Dockerfile.frontend1-29 |
| Internal Port | `5173` |
| Package Manager | `pnpm` |

**Source:** docker-compose.yml15-36

#### Build Process

The frontend build follows a multi-stage approach:

```
pnpm install  
--frozen-lockfile

Build Args  
VITE_SUPABASE_URL  
VITE_SUPABASE_ANON_KEY

pnpm run build  
react-router build

pnpm run start  
react-router-serve
```

**Key build steps:**

1. **Dependency installation** with frozen lockfile for reproducibility (Dockerfile.frontend11)
2. **Build-time argument injection** for Supabase configuration (Dockerfile.frontend14-19)
3. **React Router build** that generates the production bundle (Dockerfile.frontend23)
4. **Server start** using `react-router-serve` (Dockerfile.frontend29)

**Sources:** Dockerfile.frontend1-29 package.json7-9

# Terminal 1: Frontend

pnpm run dev  # Port 5173

### Frontend Build Pipeline

```
package.json  
pnpm-lock.yaml

pnpm install  
--frozen-lockfile

Build Args  
VITE_SUPABASE_*

Source Code  
app/, public/

react-router build  
Vite bundling

./build/  
Server bundle  
Client assets

react-router-serve  
Port 5173
```

**Build commands:**

1. `pnpm install --frozen-lockfile` - Install dependencies from lockfile (Dockerfile.frontend11)
2. `pnpm run build` - Execute `react-router build` (Dockerfile.frontend23 package.json7)
3. `pnpm run start` - Execute `react-router-serve ./build/server/index.js` (Dockerfile.frontend29 package.json9)

**Build outputs:**

* `./build/server/` - Server-side rendering bundle
* `./build/client/` - Client-side assets (JavaScript, CSS)

**Sources:** Dockerfile.frontend1-29 package.json6-14

### Timeline State Management (`useTimeline`)

The `useTimeline` hook serves as the central state manager for the entire timeline system. It maintains the current timeline configuration and provides methods for all editing operations.

| Function | Purpose | Key Operations |
| --- | --- | --- |
| `handleDropOnTrack` | Adds media items to tracks | Position calculation, UUID generation, grouped scrubber cloning |
| `handleUpdateScrubber` | Updates scrubber properties | Track changes, undo stack management, state updates |
| `handleUpdateScrubberWithLocking` | Updates connected scrubbers | Connected element detection, group movement |
| `handleZoomIn/Out/Reset` | Manages timeline zoom | Proportional position/width scaling with zoom ratio |
| `getTimelineData` | Converts to render format | Timeline → TimelineDataItem transformation |
| `handleSplitScrubberAtRuler` | Splits scrubbers at playhead | Trim calculation, dual scrubber creation with preserved trim |
| `handleGroupScrubbers` | Groups selected scrubbers | Creates grouped scrubber with nested structure |
| `handleUngroupScrubber` | Ungroups a grouped scrubber | Flattens nested scrubbers to track level |
| `snapshotTimeline` | Creates undo checkpoint | Deep clones timeline state, manages undo stack |
| `undo/redo` | Navigates timeline history | Swaps between undo/redo stacks |

**Sources:** app/hooks/useTimeline.ts18-1313

## State Management Flow

## The useMediaBin Hook

The `useMediaBin` hook is the primary state management interface for the media bin. It accepts a callback function for cascading deletions and returns methods for manipulating media assets.

### Hook Signature

```
useMediaBin(handleDeleteScrubbersByMediaBinId: (mediaBinId: string) => void)
```

**Parameters:**

* `handleDeleteScrubbersByMediaBinId`: Callback function from `useTimeline` that removes timeline scrubbers when their source media is deleted

**Sources:** app/hooks/useMediaBin.ts155

### Returned Interface

| Method | Purpose |
| --- | --- |
| `mediaBinItems` | Current array of `MediaBinItem[]` |
| `isMediaLoading` | Boolean indicating initial asset loading state |
| `getMediaBinItems` | Getter function returning current media bin items |
| `setTextItems` | Batch replace text items in media bin |
| `handleAddMediaToBin` | Upload a file (video/image/audio) to the media bin |
| `handleAddTextToBin` | Add a text element to the media bin |
| `handleDeleteMedia` | Delete a media item and its associated timeline scrubbers |
| `handleSplitAudio` | Clone a video asset and create an audio-only version |
| `handleAddGroupToMediaBin` | Add a grouped scrubber as a reusable media bin item |
| `contextMenu` | Context menu state (position and target item) |
| `handleContextMenu` | Show context menu on right-click |
| `handleDeleteFromContext` | Delete action from context menu |
| `handleSplitAudioFromContext` | Split audio action from context menu |
| `handleCloseContextMenu` | Close context menu |

**Sources:** app/hooks/useMediaBin.ts519-534

## Asset Loading and Hydration

When the editor loads, the media bin automatically hydrates existing assets from the backend based on the current project context.

### Project-Based Asset Hydration Flow

```
"mediaBinItems""PostgreSQL""/api/assets""window.location""useMediaBin""mediaBinItems""PostgreSQL""/api/assets""window.location""useMediaBin""credentials: 'include'""Text items preserved across loads""Extract projectId from pathname""projectId or null""GET /api/assets?projectId=xyz""Query assets table""Assets for project""AssetsResponseSchema JSON""Parse and validate with Zod""Infer mediaType from file extension""Merge with existing text items""setIsMediaLoading(false)"
```

### Extension-Based Type Inference

The system infers media type from file extensions when hydrating assets from the database:

| Extension Pattern | Inferred Type |
| --- | --- |
| `mp4, mov, webm, mkv, avi` | `video` |
| `mp3, wav, aac, ogg, flac` | `audio` |
| `jpg, jpeg, png, gif, bmp, webp` | `image` |
| Default | `image` |

**Sources:** app/hooks/useMediaBin.ts173-222 app/hooks/useMediaBin.ts190-196

## File Upload Pipeline

The upload system implements an **optimistic UI pattern** with progress tracking and atomic state updates.

### Upload Flow Diagram

```
User selects file

Validate MIME type

generateUUID()

URL.createObjectURL(file)

getMediaMetadata(file, mediaType)

Add MediaBinItem to state  
isUploading: true  
uploadProgress: 0

Create FormData

POST /api/assets/upload

onUploadProgress callback

Update uploadProgress in state

Upload complete

Replace id with DB ID  
Set mediaUrlRemote  
isUploading: false

Upload error

Remove item from state
```

### Upload Implementation Details

The `handleAddMediaToBin` function coordinates the upload process:

1. **Pre-upload validation and metadata extraction** (app/hooks/useMediaBin.ts224-243):

* Validates MIME type (`video/*`, `image/*`, `audio/*`)
   * Generates temporary UUID
   * Creates blob URL for immediate preview
   * Extracts metadata via `getMediaMetadata`
2. **Optimistic UI update** (app/hooks/useMediaBin.ts246-262):

* Adds item to `mediaBinItems` state immediately
   * Sets `isUploading: true` and `uploadProgress: 0`
   * User sees asset in media bin before upload completes
3. **Upload with progress tracking** (app/hooks/useMediaBin.ts264-289):

* POSTs to `/api/assets/upload` with FormData
   * Custom headers: `X-Media-Width`, `X-Media-Height`, `X-Media-Duration`, `X-Original-Name`, `X-Project-Id`
   * `withCredentials: true` for authentication
   * `onUploadProgress` callback updates `uploadProgress` in state
4. **Success handling** (app/hooks/useMediaBin.ts295-307):

* Replaces temporary UUID with database-generated asset ID
   * Sets `mediaUrlRemote` from server response
   * Sets `isUploading: false` and clears `uploadProgress`
5. **Error handling** (app/hooks/useMediaBin.ts308-316):

* Removes failed item from media bin
   * Throws error with descriptive message

**Sources:** app/hooks/useMediaBin.ts224-317

## Metadata Extraction

The `getMediaMetadata` function extracts duration and dimensions from media files using browser APIs. It returns a promise that resolves when metadata is available.

Before uploading, the client extracts media metadata using browser APIs. This ensures the server receives complete asset information without performing expensive media parsing operations.

### Metadata Extraction by Media Type

```
video

image

audio

getMediaMetadata(file, mediaType)

URL.createObjectURL(file)

mediaType?

document.createElement('video')

video.onloadedmetadata

Extract:  
videoWidth, videoHeight, duration

new Image()

img.onload

Extract:  
naturalWidth, naturalHeight

document.createElement('audio')

audio.onloadedmetadata

Extract:  
duration  
width: 0, height: 0

resolve(metadata)

URL.revokeObjectURL(url)
```

```
video

image

audio

File Object  
from user selection

URL.createObjectURL(file)

mediaType?

document.createElement('video')  
video.preload = 'metadata'

new Image()

document.createElement('audio')  
audio.preload = 'metadata'

video.onloadedmetadata

Extract:  
videoWidth, videoHeight,  
duration

img.onload

Extract:  
naturalWidth, naturalHeight  
(no duration)

audio.onloadedmetadata

Extract:  
duration  
(width=0, height=0)

resolve({ durationInSeconds, width, height })

URL.revokeObjectURL(url)
```

Sources: app/hooks/useMediaBin.ts74-153

**Metadata Interface:**

```
{

durationInSeconds?: number  // undefined for images

width: number              // 0 for audio

height: number            // 0 for audio

}
```

The `getMediaMetadata()` helper function creates temporary DOM elements to load the media file and extract its properties. For videos and audio, the `loadedmetadata` event fires once the browser has parsed the file headers. For images, the `load` event provides natural dimensions.

### Implementation Notes

* **Video extraction** (app/hooks/useMediaBin.ts86-108): Creates `<video>` element with `preload="metadata"`, extracts `videoWidth`, `videoHeight`, and `duration`
* **Image extraction** (app/hooks/useMediaBin.ts109-129): Creates `Image()` object, extracts `naturalWidth` and `naturalHeight`, no duration
* **Audio extraction** (app/hooks/useMediaBin.ts130-152): Creates `<audio>` element with `preload="metadata"`, extracts `duration`, sets dimensions to 0
* **Error handling**: Each media type has `onerror` handler that rejects the promise
* **Memory cleanup**: `URL.revokeObjectURL(url)` called in all paths to prevent memory leaks

**Sources:** app/hooks/useMediaBin.ts74-153

## Asset Operations

### Delete Operation

The `handleDeleteMedia` function implements type-specific deletion strategies with cascading timeline cleanup.

#### Deletion Logic by Media Type

```
text or  
groupped_scrubber

video, image,  
or audio

true

false

handleDeleteMedia(item)

item.mediaType

Local-only deletion

Remove from mediaBinItems state

handleDeleteScrubbersByMediaBinId(item.id)

DELETE /api/assets/:id

response.ok?

Remove from state + cascade

Log error
```

**Implementation details:**

* **Text/grouped scrubbers** (app/hooks/useMediaBin.ts382-388): Local state removal only, no server call
* **Media files** (app/hooks/useMediaBin.ts391-406):
  + Calls authenticated endpoint `DELETE /api/assets/:id`
  + Uses `credentials: "include"` for session cookie
  + On success, removes from state and cascades to timeline scrubbers
* **Cascading deletion**: Always calls `handleDeleteScrubbersByMediaBinId` to remove timeline references

**Sources:** app/hooks/useMediaBin.ts378-412

### Audio Split Operation

The `handleSplitAudio` function clones a video asset on the server and creates an audio-only media bin item that references the same file.

#### Split Audio Flow

```
"mediaBinItems""Backend out/ directory""/api/assets/:id/clone""handleSplitAudio"User"mediaBinItems""Backend out/ directory""/api/assets/:id/clone""handleSplitAudio"User"credentials: 'include'""Right-click video → Split Audio""Validate mediaType === 'video'""Check mediaUrlRemote exists""POST /api/assets/:id/clone{suffix: '(Audio)'}""Copy file in out/ directory""Create new asset record""{ asset: { mediaUrlRemote, ... } }""Create audio MediaBinItemname: 'video.mp4 (Audio)'mediaType: 'audio'""Add audio item to media bin""Audio item appears in media bin"
```

* Validates source item is a video (app/hooks/useMediaBin.ts415-417)
* Checks for `mediaUrlRemote` (app/hooks/useMediaBin.ts421-423)
* Calls `POST /api/assets/:id/clone` with `{suffix: "(Audio)"}` (app/hooks/useMediaBin.ts426-433)
* Creates new `MediaBinItem` with `mediaType: "audio"` (app/hooks/useMediaBin.ts436-451)
* Reuses original video's `mediaUrlLocal` blob URL for immediate playback
* Sets dimensions to 0 for audio (no visual component)
* Adds to media bin state (app/hooks/useMediaBin.ts454)

**Sources:** app/hooks/useMediaBin.ts414-462

## Special Media Types

### Text Items

Text items are client-side constructs that don't require backend storage. They are created via `handleAddTextToBin`.

**Text creation parameters:**

* `textContent`: Display text
* `fontSize`: Font size in pixels
* `fontFamily`: CSS font family
* `color`: CSS color string
* `textAlign`: `"left" | "center" | "right"`
* `fontWeight`: `"normal" | "bold"`

**Storage behavior:**

* Added directly to `mediaBinItems` state with `mediaType: "text"`
* No upload to server (no `mediaUrlLocal` or `mediaUrlRemote`)
* `durationInSeconds: 0` (duration determined by timeline placement)
* Preserved across asset hydration (filtered and re-merged)

**Sources:** app/hooks/useMediaBin.ts319-355

## Integration with Frontend

The frontend sends AI requests to `/ai/api/ai` (proxied through Nginx to the FastAPI service on port 3000). The typical request includes:

1. **User message**: Natural language command
2. **Timeline state**: Serialized JSON of current timeline structure
3. **Media bin items**: List of available assets
4. **Chat history**: Previous conversation turns for context

The response is either a function call (which the frontend executes by calling the appropriate state update function in `useTimeline`) or an assistant message (displayed in the chat UI).

The `useRenderer` hook provides the primary interface for frontend components to trigger video rendering:

**Diagram: Frontend-Backend Rendering Integration**

```
Rendering Engine

Backend Service

Frontend Hooks

Frontend Components

1.GET /health

2.getTimelineData()

TimelineDataItem[]

3.Calculate dimensions  
from media or defaults

4.POST /render  
{timelineData, dimensions}

Fetch media files

out/TimelineComposition.mp4

Stream MP4 blob

Auto-download  
rendered-video.mp4

TimelineControls  
Component

RenderActionButtons  
onRenderVideo callback

useRenderer Hook

useTimeline Hook

/render Endpoint

/health Endpoint

/media/:filename

Remotion  
renderMedia()

FFmpeg Process
```

**Sources:** app/hooks/useRenderer.ts14-166 app/components/timeline/TimelineControls.tsx1-67

### Frontend Error Handling

The `useRenderer` hook implements comprehensive error handling with specific messages for different failure modes:

**Diagram: Frontend Error Handling Logic**

```
Success

Failure

Empty

Valid

Success

Timeout

500 Error

Network Error

Other Error

handleRenderVideo() called

GET /health  
(5s timeout)

Validate timeline  
has scrubbers

Error: Cannot connect to  
render server on :8000

Error: No timeline data  
to render

Calculate dimensions  
from media or defaults

POST /render  
(15min timeout)

Create blob URL  
Trigger download  
Cleanup URL

Error: Render timeout -  
try a shorter video

Error: Server error  
during rendering

Error: Cannot connect  
to render server

Error: Unknown  
rendering error

Status: Video rendered  
and downloaded successfully

Display error for 8s

Clear status after 8s
```

**Sources:** app/hooks/useRenderer.ts132-156

## Health Check Endpoint

The `/health` endpoint provides system resource monitoring:

```
GET /health
```

```
{

"status": "ok",

"memory": {

"rss": "245 MB",

"heapTotal": "128 MB",

"heapUsed": "89 MB"

},

"uptime": "3600 seconds"

}
```

The frontend calls this endpoint before initiating renders to verify server connectivity:

```
try {

await axios.get(apiUrl("/health"), { timeout: 5000 });

} catch (healthError) {

throw new Error(

"Cannot connect to render server. Make sure the server is running on http://localhost:8000"

);

}
```

**Sources:** app/videorender/videorender.ts252-263 app/hooks/useRenderer.ts29-35

## Performance Characteristics

### Resource Utilization

The rendering configuration is optimized for a production server with:

* **CPU:** 4 vCPUs (uses 3 for rendering, reserves 1 for system)
* **Memory:** 8GB RAM (4GB Docker container limit)
* **Storage:** Persistent volume for `out/` directory

#### Terminal 1: Frontend Service

```
pnpm run dev
```

**What this does:**

* Executes `react-router dev` (package.json8)
* Starts Vite development server with HMR
* Serves React Router SSR application
* **Listens on:** `http://localhost:5173`
* **Ready when:** "ROUTE | | routes/index.tsx" messages appear

### 1. Frontend Health Check

Visit `http://localhost:5173` in your browser. You should see the landing page.

**Expected behavior:**

* Page loads without errors
* No console errors related to missing environment variables
* Navigation to `/login` shows Google OAuth button

## State Management Architecture

## Architectural Overview

The state management architecture follows a **hook-based composition pattern** where each major subsystem of the editor is managed by a dedicated custom hook:

| Hook | Responsibility | Primary State |
| --- | --- | --- |
| `useTimeline` | Timeline tracks, scrubbers, transitions, zoom, undo/redo | `TimelineState`, zoom level, history stacks |
| `useMediaBin` | Media asset library, uploads, metadata | `MediaBinItem[]`, loading state |
| `useRuler` | Playhead position, drag interactions | Ruler position in pixels, drag state |
| `useRenderer` | Video rendering orchestration | Render status, progress |
| `useAuth` | User authentication and session | `AuthUser` object, loading states |

These hooks are instantiated and orchestrated by the main `TimelineEditor` component, which serves as the integration point for all state management concerns.

**Sources:** app/routes/home.tsx46-182 app/hooks/useTimeline.ts18-27 app/hooks/useMediaBin.ts155-171 app/hooks/useAuth.ts54-58

## Hook Composition in TimelineEditor

The following diagram illustrates how state management hooks are composed in the main editor component:

```
Cross-Hook Communication

Rendered UI Components

TimelineEditor Component (home.tsx)

provides callback

receives callback

useTimeline()  
• timeline state  
• 30+ mutation methods  
• undo/redo stacks

useMediaBin()  
• mediaBinItems[]  
• upload handlers  
• context menu state

useRuler()  
• rulerPositionPx  
• drag handlers

useRenderer()  
• isRendering  
• renderStatus

useAuth()  
• user  
• signIn/signOut

Local Component State  
• selectedScrubberIds  
• selectedItem  
• projectName  
• width/height  
• isChatMinimized

LeftPanel  
(MediaBin)

TimelineTracks

TimelineRuler

VideoPlayer

ChatBox

Callback Props  
handleDeleteScrubbersByMediaBinId
```

**Key Architectural Decisions:**

1. **No Global State**: Each hook manages its own slice of state using `useState`. There is no centralized Redux store or context provider.
2. **Callback-Based Communication**: Hooks communicate through callback functions passed as arguments. For example, `useMediaBin` receives `handleDeleteScrubbersByMediaBinId` from `useTimeline` to cascade deletions.
3. **Parent Component Orchestration**: The `TimelineEditor` component acts as the orchestrator, instantiating all hooks and wiring them together through props and callbacks.
4. **Minimal Prop Drilling**: UI components receive only the state and callbacks they need, avoiding deep prop drilling.

**Sources:** app/routes/home.tsx115-182 app/hooks/useMediaBin.ts155

## useTimeline: Timeline State Management

The `useTimeline` hook is the most complex state management hook in the application, managing the core timeline data structure with support for undo/redo, zoom, collision detection, and transitions.

### State Structure

```
Auxiliary State

timelineWidth: number

zoomLevel: number

undoStack: TimelineState[]

redoStack: TimelineState[]

TimelineState

tracks: TrackState[]

track-1  
scrubbers: []  
transitions: []

track-2  
scrubbers: []  
transitions: []

track-3  
scrubbers: []  
transitions: []

track-4  
scrubbers: []  
transitions: []
```

**Sources:** app/hooks/useTimeline.ts19-27 app/hooks/useTimeline.ts29-36

### Undo/Redo Implementation

The undo/redo system uses a **snapshot-based approach** with manual history management:

```
"timeline state"RedoStackUndoStackuseTimelineComponentUser"timeline state"RedoStackUndoStackuseTimelineComponentUserNot applying history, so branchDrags scrubberhandleUpdateScrubber()Check isApplyingHistoryRefpush(deepClone(prevTimeline))clear()setState(newTimeline)Ctrl+Z (undo)undo()Set isApplyingHistoryRef = truepop()push(deepClone(currentTimeline))setState(previousTimeline)Set isApplyingHistoryRef = falseCtrl+Shift+Z (redo)redo()Set isApplyingHistoryRef = truepop()push(deepClone(currentTimeline))setState(nextTimeline)Set isApplyingHistoryRef = false
```

* **Snapshot Timing**: Snapshots are taken via `snapshotTimeline()` before destructive operations (add track, delete scrubber, split, group, etc.)
* **Non-Destructive Updates**: Edits like dragging scrubbers use inline history branching within `handleUpdateScrubber()` for smoother UX
* **History Cap**: Stack is limited to 100 states to prevent memory growth
* **Ref Guard**: `isApplyingHistoryRef` prevents undo/redo operations from creating new history entries
* **Deep Cloning**: `deepClone()` uses `JSON.parse(JSON.stringify())` for immutable snapshots

**Sources:** app/hooks/useTimeline.ts34-72 app/hooks/useTimeline.ts279-337 app/routes/home.tsx401-412

### Immutable State Updates

All timeline mutations follow React's immutable update pattern using spread operators and array methods:

**Example: Updating a scrubber across tracks**

```
// Pseudocode from handleUpdateScrubber logic

setTimeline((prev) => ({

...prev,

tracks: prev.tracks.map((track, index) => {

if (index === currentTrackIndex) {

return {

...track,

scrubbers: track.scrubbers.filter((s) => s.id !== updatedScrubber.id)

};

} else if (index === newTrackIndex) {

return {

...track,

scrubbers: [...track.scrubbers, updatedScrubber]

};

}

return track;

})

}));
```

**Key Patterns:**

* `map()` for transforming arrays while preserving others
* `filter()` for removal operations
* Spread operators `{...obj}` and `[...arr]` for shallow copies
* Functional `setState((prev) => ...)` for stable references

**Sources:** app/hooks/useTimeline.ts279-337 app/hooks/useTimeline.ts418-441

### Zoom Level Management

Zoom is implemented by scaling scrubber positions and widths while maintaining time-based relationships:

```
Zoom In/Out Flow

currentZoom = zoomLevelRef.current

newZoom = currentZoom * 1.5  
(or / 1.5 for zoom out)

zoomRatio = newZoom / currentZoom

zoomLevelRef.current = newZoom

setZoomLevel(newZoom)

Scale all scrubbers:  
left *= zoomRatio  
width *= zoomRatio
```

**Zoom Characteristics:**

* **Multiplicative Scaling**: Each zoom step multiplies by 1.5 or divides by 1.5
* **Ref + State**: Uses both `zoomLevelRef` (for calculations) and `zoomLevel` state (for re-renders)
* **Preserves Time**: `getPixelsPerSecond()` always returns `PIXELS_PER_SECOND * zoomLevel`
* **Mouse Wheel**: Ctrl+scroll triggers zoom via event listener on timeline container

**Sources:** app/hooks/useTimeline.ts82-143 app/routes/home.tsx719-743

## useMediaBin: Asset Management State

The `useMediaBin` hook manages the media library and implements optimistic UI updates for file uploads.

### Optimistic Upload Pattern

```
ServerLocalStateBrowserServer["Backend /api/assets/upload"]Browser["Browser APIs"]LocalState["mediaBinItems state"]useMediaBinUserServerLocalStateBrowserServer["Backend /api/assets/upload"]Browser["Browser APIs"]LocalState["mediaBinItems state"]useMediaBinUserOptimistic UI: Show immediatelyloop[Upload Progress]Drop file / Select fileURL.createObjectURL(file)blob:http://... (local URL)getMediaMetadata(file)width, height, durationAdd MediaBinItem{id: tempUUID, mediaUrlLocal: blob,isUploading: true, uploadProgress: 0}POST with FormData+ metadata headersonUploadProgress eventsUpdate uploadProgress %{asset: {id: dbId, mediaUrlRemote}}Update MediaBinItem{id: dbId, mediaUrlRemote: remote,isUploading: false, uploadProgress: null}
```

**Optimistic UI Benefits:**

1. **Immediate Feedback**: File appears in media bin instantly with progress indicator
2. **Local Preview**: Blob URL allows immediate drag-to-timeline before upload completes
3. **Graceful Failure**: On upload error, item is removed from state with error toast

**State Transitions:**

* **Initial**: `isUploading: false`, no upload in progress
* **Optimistic Add**: `isUploading: true, uploadProgress: 0`, local blob URL
* **Uploading**: `isUploading: true, uploadProgress: 0-100`
* **Complete**: `isUploading: false, uploadProgress: null`, remote URL added
* **Failed**: Item removed from state entirely

**Sources:** app/hooks/useMediaBin.ts224-317 app/hooks/useMediaBin.ts74-153

### Asset Hydration from Server

On component mount, existing assets are fetched from the server and merged with local text items:

```
useEffect on projectId change

Fetch /api/assets  
?projectId={id}

Parse AssetsResponseSchema

Map to MediaBinItem[]  
(non-text items)

setMediaBinItems:  
Keep existing text items  
Add fetched assets
```

* **Text Preservation**: Text items (client-only) are preserved during asset hydration
* **Type Inference**: Media type inferred from file extension
* **Loading State**: `isMediaLoading` prevents premature UI interactions
* **Project Isolation**: Assets are filtered by `projectId` parameter

**Sources:** app/hooks/useMediaBin.ts173-222

## useRuler: Playhead State Management

The `useRuler` hook manages the playhead (ruler) position and synchronization with the video player.

### State and Interactions

```
Bi-directional Sync

Interactions

RulerState

frameupdate event

rulerPositionPx: number

isDraggingRuler: boolean

handleRulerMouseDown

handleRulerMouseMove

handleRulerMouseUp

updateRulerFromPlayer

playerRef.current

Timeline Container
```

**Bidirectional Synchronization:**

* **Player → Ruler**: Video player's `frameupdate` event calls `updateRulerFromPlayer()` to move ruler during playback
* **Ruler → Player**: Dragging ruler updates `playerRef.current.seekTo()` for scrubbing
* **Manual Drag**: Click and drag on ruler seeks player to new position
* **Scroll Expansion**: Dragging near edge triggers timeline expansion via `expandTimeline()`

**Sources:** app/hooks/useRuler.ts1-100 (file not provided, but referenced in home.tsx), app/routes/home.tsx170-179 app/routes/home.tsx632-647

## useAuth: Authentication State Management

The `useAuth` hook implements a **dual-source reconciliation pattern** to ensure robust session state management across Better Auth client SDK and REST API.

### Dual-Source Reconciliation

```
"user state""authClient.getSession()""REST: /api/auth/session""useAuth Hook""user state""authClient.getSession()""REST: /api/auth/session""useAuth Hook"Initial Mount or OAuth Returnpar[Parallel Fetch]alt[Both sources agree (user present)][Both sources agree (no user)][Sources disagree]After OAuth Callbackloop[Retry with backoff (5 attempts)]Clean up URL params after processingfetch /api/auth/session{user: {...}} or 404authClient.getSession(){data: {user: {...}}} or nullreconcileAndSet(restResult, clientResult)setUser(normalizedUser)setUser(null)Prefer first non-null/undefined sourceRetry fetch sessionRetry getSession()reconcileAndSet()
```

**Reconciliation Logic:**

1. **Undefined vs Null**: `undefined` return means error/unavailable (ignore), `null` means no session (respect)
2. **Preference**: Prefer any non-null user; only set `null` if both sources return `null`
3. **Retry on OAuth**: After detecting OAuth callback parameters, retry 5 times with 800ms intervals to wait for session propagation
4. **Event Listeners**: Window focus and visibility change trigger session re-checks

**OAuth Flow Handling:**

The hook detects OAuth callback by checking URL parameters (`code`, `state`, `error`) and implements aggressive retry logic with URL cleanup:

**Sources:** app/hooks/useAuth.ts60-195 app/hooks/useAuth.ts104-156

## Server Synchronization Patterns

State synchronization with the backend follows these patterns:

### On-Demand Saves

Timeline state is persisted via explicit user action (Ctrl+S or Save button), not autosave:

```
User: Ctrl+S or  
Click Save

getTimelineState()

getMediaBinItems()  
.filter(text items)

PATCH /api/projects/:id  
{timeline, textBinItems}

toast.success

toast.error
```

**Rationale:**

* **User Control**: Avoids unwanted saves during experimentation
* **Performance**: No continuous network traffic during editing
* **Explicit Checkpoints**: Users choose when to commit changes

**Sources:** app/routes/home.tsx359-385 app/routes/home.tsx388-431

### Hydration on Mount

Project data loads once on component mount, restoring both timeline and text items:

```
useEffect on projectId

GET /api/projects/:id

setTimelineFromServer(j.timeline)

Process j.textBinItems

Fallback: Extract text  
from timeline.scrubbers

setTextItems()
```

**Dual Text Sources:**

* **Preferred**: `textBinItems` saved alongside timeline
* **Fallback**: Extract text scrubbers from timeline structure (legacy support)

**Sources:** app/routes/home.tsx254-318

### Asset URL Re-linking

After assets hydrate, scrubbers are re-linked to remote URLs to fix blob URL invalidation on page refresh:

```
mediaBinItems loaded

Build Map:  
name → MediaBinItem

For each scrubber  
without mediaUrlRemote

Find match by name

Update scrubber:  
mediaUrlRemote  
sourceMediaBinId  
dimensions

setTimelineFromServer()
```

**Purpose**: After page refresh, local blob URLs (`blob:http://...`) are invalid, but scrubbers still reference them. This logic re-establishes the connection to persisted remote URLs.

**Sources:** app/routes/home.tsx321-356

## State Mutation Conventions

The codebase follows consistent patterns for state mutations:

### Functional Updates

All `setState` calls use functional form when referencing previous state:

```
// ✅ Correct: Functional update

setTimeline((prev) => ({

...prev,

tracks: prev.tracks.map(/* ... */)

}));

// ❌ Incorrect: Direct reference (stale closure risk)

setTimeline({

...timeline,

tracks: timeline.tracks.map(/* ... */)

});
```

**Sources:** app/hooks/useTimeline.ts249-253 app/hooks/useTimeline.ts418-441

### Immutable Array Operations

| Operation | Pattern | Example |
| --- | --- | --- |
| Add | Spread + new item | `[...prev, newItem]` |
| Remove | `filter()` | `prev.filter((item) => item.id !== id)` |
| Update | `map()` with conditional | `prev.map((item) => item.id === id ? updated : item)` |
| Replace | `flatMap()` | `prev.flatMap((item) => item.id === id ? [new1, new2] : [item])` |

**Sources:** app/hooks/useTimeline.ts305-312 app/hooks/useTimeline.ts719-730

### Object Spread Hierarchy

Nested objects require multiple spread levels:

```
setTimeline((prev) => ({

...prev,                                    // Timeline level

tracks: prev.tracks.map((track) => ({

...track,                                 // Track level

scrubbers: track.scrubbers.map((s) => ({

...s,                                   // Scrubber level

text: s.text ? { ...s.text, /* ... */ } : null

}))

}))

}));
```

**Sources:** app/hooks/useTimeline.ts972-1012

## Cross-Hook Communication

Hooks communicate through three mechanisms:

### 1. Callback Props

Parent component passes callbacks from one hook to another:

```
// Timeline provides deletion callback

const { handleDeleteScrubbersByMediaBinId } = useTimeline();

// Media bin receives and uses it

const { mediaBinItems, handleDeleteMedia } = useMediaBin(

handleDeleteScrubbersByMediaBinId  // ← Injected dependency

);
```

**Sources:** app/routes/home.tsx115-164

### 2. Ref Sharing

Some hooks receive refs to synchronize with imperative APIs:

```
const playerRef = useRef<PlayerRef>(null);

// useRuler needs player ref for seeking

const { updateRulerFromPlayer } = useRuler(

playerRef,      // ← Shared ref

timelineWidth,

getPixelsPerSecond()

);

// Player component receives same ref

<VideoPlayer ref={playerRef} /* ... */ />
```

**Sources:** app/routes/home.tsx75-179

### 3. Local State Bridges

Parent component maintains bridging state that connects multiple hooks:

```
// Local state for selection

const [selectedScrubberIds, setSelectedScrubberIds] = useState<string[]>([]);

// Used by both timeline operations and UI rendering

const handleSplitClick = () => {

handleSplitScrubberAtRuler(rulerPositionPx, selectedScrubberIds[0]);

setSelectedScrubberIds([]);

};
```

**Sources:** app/routes/home.tsx110-569

