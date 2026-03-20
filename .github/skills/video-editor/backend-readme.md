### Backend Stack

| Component | Technology | Purpose |
| --- | --- | --- |
| Runtime | Node.js 20 | JavaScript server execution |
| Framework | Express 5 | HTTP server and routing |
| Video Rendering | `@remotion/renderer` 4.0.329 | Server-side video composition |
| Bundler | `@remotion/bundler` 4.0.329 | Remotion composition bundling |
| Database Client | `pg` 8.16.3 | PostgreSQL connectivity |
| File Upload | `multer` 2.0.2 | Multipart form data handling |

### AI Backend Stack

| Component | Technology | Purpose |
| --- | --- | --- |
| Framework | FastAPI (Python 3.13) | API server for AI features |
| AI Model | Gemini 2.5 Flash | Natural language processing |
| Database Client | Python PostgreSQL driver | Database operations |

### Video Rendering Flow

```
RemotionRendererBackendAPIuseRendererFrontendRemotionRendererBackendAPIuseRendererFrontend"handleRenderVideo()""Calculate compositiondimensions""POST /render{timelineData, durationInFrames}""renderMedia()codec: h264""Bundle + FFmpeg encode""video.mp4""Stream MP4 blob""Auto-download file"
```

### Asset Upload Flow

```
DatabaseFileSystemBackendAPIuseMediaBinMediaBinUserDatabaseFileSystemBackendAPIuseMediaBinMediaBinUser"Select file""handleUpload()""Optimistic UIAdd with temp ID""POST /api/assets/uploadFormData""Write to out/""INSERT assets table""{id, url}""Replace temp IDwith server ID"
```

## Key Code Entities

### Backend Components

| Component | Purpose |
| --- | --- |
| `videorender.ts` | Express server for video rendering |
| `auth.server.ts` | Better Auth configuration and session management |
| `TimelineComposition` | Remotion component that renders timeline data |
| `/api/assets` routes | Asset upload, clone, delete endpoints |
| `/api/projects` routes | Project CRUD operations |

### Backend Service (Video Rendering)

The backend is a **Node.js + Express** service dedicated to computationally intensive video rendering operations:

* Video composition rendering using `@remotion/renderer`
* FFmpeg-based video encoding (H.264 codec)
* Media file storage and retrieval from `out/` directory
* Timeline data processing for rendering

* Framework: Express 5.1
* Port: 8000 (internal)
* Memory Limit: 2GB (configured in Docker)
* Concurrency: 3 parallel rendering threads
* Path: app/videorender/videorender.ts

## Backend Services

This page documents the two backend services that power the Kimu Video Editor: the **Node.js Express service** for video rendering and media asset management, and the **Python FastAPI service** for AI-powered editing features. These services operate independently but share access to the PostgreSQL database and file system.

For information about the frontend's interaction with these services, see [Frontend Architecture](./frontend-readme.md). For deployment configuration and orchestration, see [Infrastructure and Deployment](./deployment-readme.md). For detailed API specifications, see [API Reference](./backend-readme.md).

## Service Overview

Kimu employs a **microservices architecture** with two specialized backend services behind an Nginx reverse proxy:

| Service | Technology | Port | Primary Responsibility | Key Dependencies |
| --- | --- | --- | --- | --- |
| **Backend Service** | Node.js + Express | 8000 | Video rendering, media asset storage, file operations | Remotion, FFmpeg, Multer |
| **FastAPI Service** | Python 3.13 | 3000 | AI assistant, natural language processing, tool calling | Google Gemini API, FastAPI |

Both services share access to:

* **PostgreSQL database** - Projects, assets, sessions, user data
* **File system (`out/` directory)** - Uploaded media files and rendered videos

**Sources:** app/videorender/videorender.ts1-367 backend/main.py1-407 Diagram 1 from high-level architecture

## Node.js Express Backend (Port 8000)

The Node.js backend service is a specialized **video rendering and media management server** built with Express. It handles computationally intensive video composition using Remotion and manages the lifecycle of media assets.

### Technology Stack

* **Runtime:** Node.js 20 (Bookworm Slim)
* **Web Framework:** Express.js
* **Video Rendering:** Remotion (`@remotion/bundler`, `@remotion/renderer`)
* **File Upload:** Multer with disk storage
* **Video Encoding:** FFmpeg (h264 codec)
* **Security:** Path validation utilities, CORS middleware

**Sources:** app/videorender/videorender.ts1-10

### Core Components

#### Bundle and Composition System

The service pre-bundles the Remotion composition at startup for performance:

```
// Pre-bundle the TimelineComposition component

const bundleLocation = await bundle({

entryPoint: path.resolve("./app/videorender/index.ts"),

webpackOverride: (config) => config,

});
```

The `compositionId = "TimelineComposition"` is the single composition used for all video renders. This bundled composition is reused across multiple render requests with different input props.

**Sources:** app/videorender/videorender.ts11-19

#### Express Application Structure

```
Route Handlers

Express Middleware Stack

cors()  
Allow Origins *

express.json()  
Body Parser

/health  
GET  
System Metrics

/upload  
POST  
Single File

/upload-multiple  
POST  
Bulk Upload

/clone-media  
POST  
File Copy

/media/:filename  
DELETE  
File Removal

/media/:filename  
GET  
Internal Only

/render  
POST  
Video Composition
```

**Sources:** app/videorender/videorender.ts26-28

### Endpoint Implementations

#### Video Rendering Endpoint: `/render`

The primary endpoint accepts timeline data and produces an MP4 video file.

**Request Payload:**

```
{

timelineData: TimelineDataItem[],    // Serialized timeline state

durationInFrames: number,             // Total video length in frames

compositionWidth: number,             // Output video width

compositionHeight: number,            // Output video height

getPixelsPerSecond: number,           // Timeline zoom level

isRendering: true

}
```

**Rendering Pipeline:**

```
out/TimelineComposition.mp4FFmpeg EncoderrenderMedia()selectComposition()/render/healthFrontenduseRenderer.tsout/TimelineComposition.mp4FFmpeg EncoderrenderMedia()selectComposition()/render/healthFrontenduseRenderer.tsGET /healthConnection Test200 OK + Memory StatsPOST /render{timelineData, durationInFrames}bundleLocation + inputPropscomposition metadatacomposition + settingsconcurrency=3, codec=h264frames + encoding argspreset=fast, crf=28Write MP4 chunksEncoding completeSuccessRead completed fileStream MP4 blobresponseType: blobAuto-download to user
```

**Sources:** app/videorender/videorender.ts265-349 app/hooks/useRenderer.ts14-159

#### Rendering Configuration

The service is optimized for **4vCPU/8GB RAM servers**:

| Parameter | Value | Rationale |
| --- | --- | --- |
| `concurrency` | 3 | Use 3 cores, leave 1 for system operations |
| `codec` | h264 | Universal compatibility |
| `ffmpegOverride` preset | fast | Balance of speed and quality |
| `crf` | 28 | Compression quality (higher = smaller file) |
| `threads` | 3 | Match concurrency setting |
| `maxrate` | 5M | Prevent memory overflow on large videos |
| `bufsize` | 10M | Rate control buffer |
| `timeoutInMilliseconds` | 900000 | 15-minute timeout for long videos |

**Sources:** app/videorender/videorender.ts289-325

#### Media Upload Endpoints

**Single Upload: `/upload`**

Uses Multer disk storage with automatic filename sanitization:

```
const storage = multer.diskStorage({

destination: (req, file, cb) => {

ensureDirectoryExists("out/");

cb(null, "out/");

},

filename: (req, file, cb) => {

const uniqueName = createSafeFilename(file.originalname);

cb(null, uniqueName);  // Timestamp + sanitized name

}

});
```

* **File size limit:** 500MB per file
* **Allowed types:** Video, audio, image formats (validated by regex)
* **Security:** Path traversal prevention via `safeResolveOutPath()`

**Response:**

```
{

"success": true,

"filename": "1703001234567_video.mp4",

"originalName": "video.mp4",

"url": "/media/1703001234567_video.mp4",

"fullUrl": "http://localhost:8000/media/1703001234567_video.mp4",

"size": 10485760,

"path": "out/1703001234567_video.mp4"

}
```

**Bulk Upload: `/upload-multiple`**

Accepts up to 10 files simultaneously using `upload.array("media", 10)`. Returns an array of upload results with the same structure as single uploads.

**Sources:** app/videorender/videorender.ts38-163

#### Asset Management Endpoints

**Clone Media: `/clone-media`**

Creates a copy of an existing media file with a new filename. Used for audio extraction from video (split audio action).

**Request:**

```
{

"filename": "original.mp4",

"originalName": "original.mp4",

"suffix": "_audio"

}
```

The service uses `fs.copyFileSync()` to duplicate the file and assigns a new timestamped filename.

**Delete Media: `DELETE /media/:filename`**

Removes a file from the `out/` directory after validation. The frontend calls this when:

* User deletes a media bin item (video/image/audio type)
* Cascading deletion when associated scrubbers are removed

**Sources:** app/videorender/videorender.ts166-249

#### Internal Media Serving

**Endpoint: `GET /media/:filename`**

This endpoint serves media files **only for internal Remotion composition rendering**. It is not exposed publicly through Nginx. The frontend accesses media through authenticated API endpoints instead.

```
app.get("/media/:filename", (req: Request, res: Response): void => {

const filename = req.params.filename;

const filePath = safeResolveOutPath(decodeURIComponent(filename));

if (!filePath) {

res.status(403).json({ error: "Invalid filename" });

return;

}

res.sendFile(filePath);  // Docker network access only

});
```

**Sources:** app/videorender/videorender.ts68-91

## Python FastAPI Backend (Port 3000)

The FastAPI service provides the **AI-powered editing assistant** ("Vibe AI"), translating natural language commands into video editing operations.

### Technology Stack

* **Runtime:** Python 3.13 (slim container)
* **Web Framework:** FastAPI 0.128.0
* **AI Model:** Google Gemini 2.5 Flash via `google-genai` SDK
* **Validation:** Pydantic schemas with strict typing
* **Dev Tools:** Ruff (linting), mypy (type checking), uv (package management)

**Sources:** backend/pyproject.toml1-48 backend/main.py1-22

### Core Components

### Node.js Health Endpoint

**GET `/health`**

Returns system resource usage:

```
{

"status": "ok",

"memory": {

"rss": "512 MB",       // Resident Set Size

"heapTotal": "256 MB", // Total heap allocated

"heapUsed": "128 MB"   // Heap in use

},

"uptime": "3600 seconds"

}
```

Used by the frontend to verify server connectivity before rendering.

**Sources:** app/videorender/videorender.ts251-263 app/hooks/useRenderer.ts29-35

### Python Health Monitoring

The FastAPI service does not expose a dedicated health endpoint but includes error logging with full tracebacks for debugging:

```
except Exception as e:

print("[AI] Error:", repr(e))

traceback.print_exc()

raise HTTPException(status_code=500, detail=str(e))
```

**Sources:** backend/main.py396-401

## Development and Dependencies

### Node.js Backend Dependencies

Managed via `pnpm` in the root workspace:

* `@remotion/bundler` - Webpack bundling for compositions
* `@remotion/renderer` - Video rendering engine
* `express` - Web framework
* `multer` - Multipart file upload handling
* `cors` - Cross-origin resource sharing

**Sources:** app/videorender/videorender.ts1-7

### Python Backend Dependencies

Managed via `uv` (fast Python package installer):

| Package | Version | Purpose |
| --- | --- | --- |
| `fastapi[standard]` | ≥0.115.13 | Web framework with Uvicorn |
| `google-genai` | ≥1.22.0 | Gemini API SDK |
| `python-multipart` | ≥0.0.22 | Form data parsing |
| `ruff` | ≥0.12.1 | Linting and formatting |
| `mypy` | ≥1.16.1 | Static type checking |
| `parsedatetime` | 2.6-3.0 | Natural date/time parsing (listed but not used) |

**Type Checking Configuration:**

* `disallow_untyped_defs = true` - All functions must have type hints
* `strict_equality = true` - Enforce proper equality comparisons
* `warn_unused_ignores = true` - Flag unnecessary type: ignore comments

**Sources:** backend/pyproject.toml10-48 backend/uv.lock1-296

### Backend Service

The **backend container** (`videoeditor-backend`) handles video rendering using Remotion and manages media file storage.

#### Container Specification

| Property | Value |
| --- | --- |
| Base Image | `node:20-bookworm-slim` |
| Container Name | `videoeditor-backend` |
| Build Context | `.` (repository root) |
| Dockerfile | `Dockerfile.backend` (not shown in files) |
| Internal Port | `8000` |
| Memory Limit | `2g` |
| Swap Limit | `2g` |
| Shared Memory | `1g` |

**Source:** docker-compose.yml38-58

#### Resource Limits

Video rendering is memory-intensive, requiring explicit resource constraints:

| Resource | Limit | Purpose |
| --- | --- | --- |
| `mem_limit` | `2g` | Maximum container memory |
| `memswap_limit` | `2g` | Memory + swap limit |
| `shm_size` | `1g` | Shared memory for FFmpeg |

These limits are optimized for a target infrastructure of **4vCPU / 8GB RAM** servers. The shared memory allocation is critical for FFmpeg's multiprocessing during video encoding.

**Source:** docker-compose.yml56-58

#### Volume Mounts

The `./out` directory is mounted as a shared volume for persistent media storage:

```
volumes:

- ./out:/app/out
```

This volume contains:

* Uploaded user media files (video, audio, images)
* Rendered video outputs
* Temporary rendering artifacts

**Source:** docker-compose.yml53-54

The volume is shared with the host filesystem, allowing for backup strategies and external media management.

# Terminal 2: Backend

pnpm dlx tsx app/videorender/videorender.ts  # Port 8000

### Backend Build Pipeline

The backend build process (Dockerfile not shown in provided files, but referenced in compose file) follows a similar pattern:

1. Install Node.js dependencies with `pnpm`
2. Pre-bundle Remotion composition for faster rendering
3. Install system dependencies for FFmpeg (for video encoding)
4. Start Express server with Remotion renderer

**Expected build command:** `pnpm dlx tsx app/videorender/videorender.ts`

**Source:** README.md91

### Concurrent Rendering Configuration

Remotion's `renderMedia()` function is configured with concurrency settings (from architecture analysis):

```
codec: h264
concurrency: 3
```

**Source:** Diagram 3 analysis (render configuration)

The `concurrency: 3` setting allows FFmpeg to encode video frames using 3 parallel threads, optimized for the target 4vCPU infrastructure.

### Upload File Size Limits

Nginx is configured to accept large video file uploads:

```
client_max_body_size 500M;
```

**Sources:** nginx.conf6 nginx.conf74

This limit applies to:

* Video uploads via `/api/assets/upload`
* Any other POST/PUT requests through Nginx

**Note:** This is a Nginx-level limit. Backend services may have additional validation on file sizes.

### Connection Timeouts

Long-running operations (video rendering, AI processing) require extended timeouts:

| Setting | Value | Applies To |
| --- | --- | --- |
| `proxy_read_timeout` | `900s` (15 min) | All proxied locations |
| `proxy_send_timeout` | `900s` (15 min) | All proxied locations |

**Sources:** nginx.conf46-72

These timeouts accommodate:

* Video rendering jobs (typically 30s - 10min depending on duration)
* AI assistant processing (typically 5-30s)
* Large file uploads (500MB at typical upload speeds)

## Video Composition and Rendering

The application uses Remotion for both real-time preview and final video rendering. The same timeline data structure drives both modes.

This document covers the video composition engine and rendering pipeline in Kimu, which transforms timeline data into playable video compositions and exportable video files. The system is built on Remotion, a React-based video framework, and handles media composition, transitions, captions, and final video rendering.

For timeline state management and scrubber operations, see [Timeline System](./timeline-readme.md). For media asset management and file handling, see [Media Management](./frontend-readme.md).

### Real-time Preview

The `VideoPlayer` component wraps `@remotion/player` to provide interactive preview:

```
TimelineState  
(useTimeline)

getTimelineData()  
Convert to TimelineDataItem[]

TimelineComposition.tsx  
Remotion Component

@remotion/player  
Real-time Rendering
```

The `getTimelineData()` function converts the internal `TimelineState` (optimized for editing with pixel-based positions) into `TimelineDataItem[]` (time-based with seconds) for Remotion consumption.

### Video Export

Rendering is orchestrated by `useRenderer.handleRenderVideo()`:

1. Calculate composition dimensions (either from user input or auto-detect from media)
2. Serialize `TimelineDataItem[]` to JSON
3. POST to `/render` endpoint with timeline data and composition config
4. Backend uses `@remotion/bundler` and `renderMedia()` to produce MP4
5. Client streams the blob and triggers download

For detailed rendering pipeline documentation, see [Video Composition and Rendering](./backend-readme.md).

Sources: app/hooks/useTimeline.ts150-214 app/hooks/useRenderer.ts app/video-compositions/VideoPlayer.tsx

## Undo/Redo System

The timeline implements a complete history management system with unlimited undo/redo operations (capped at 100 states for memory management).

### Implementation

```
User Edit Operation

snapshotTimeline()  
Clone current state

undoStack: TimelineState[]  
Previous states

redoStack: TimelineState[]  
Future states (cleared on edit)

Clear redoStack

Ctrl+Z / undo()

Pop from undoStack

Push current state to redoStack

setTimeline(previous)

Ctrl+Shift+Z / redo()

Pop from redoStack

Push current state to undoStack

setTimeline(next)
```

### Snapshot Strategy

Operations that trigger snapshots (via `snapshotTimeline()`):

* Adding/deleting tracks
* Dropping media onto timeline
* Deleting scrubbers or transitions
* Splitting scrubbers
* Grouping/ungrouping
* Beginning scrubber drag operations

Operations that use internal undo tracking (via `handleUpdateScrubber`):

* Continuous scrubber dragging
* Resizing scrubbers
* Moving scrubbers between tracks

The `isApplyingHistoryRef` flag prevents recursive snapshot creation when applying undo/redo operations.

Sources: app/hooks/useTimeline.ts33-71 app/routes/home.tsx401-412

## Zoom and Navigation

## Data Flow: Editing to Rendering

The following diagram illustrates the complete data flow from user interaction through final video export:

```
BackendAPIuseRendererVideoPlayergetTimelineDataTimelineStateuseTimelineTimelineEditorUserBackendAPIuseRendererVideoPlayergetTimelineDataTimelineStateuseTimelineTimelineEditorUser"Position in px → Time in secondsleft/pixelsPerSecond = startTime""Drag media to track""handleDropOnTrack(item, trackId, dropLeftPx)""snapshotTimeline()""Create ScrubberStateleft, width, y, mediaType""Convert to TimelineDataItem[]""timelineData: TimelineDataItem[]""@remotion/player renders preview""Click Export""handleRenderVideo()""Get final timeline data""POST /render{timelineData, durationInFrames, width, height}""renderMedia()TimelineComposition + FFmpeg""video/mp4 blob stream""Download rendered-video.mp4"
```

Sources: app/routes/home.tsx464-478 app/hooks/useTimeline.ts550-653 app/hooks/useRenderer.ts

## Core Components

### Timeline to Render Data Conversion

The `getTimelineData` function transforms the editing-optimized `TimelineState` into render-optimized `TimelineDataItem[]` format for the video composition system.

```
Timeline Data (Rendering)

Conversion Process

Timeline State (Editing)

tracks[]

scrubbers[]

transitions[]

Pixel positions

getPixelsPerSecond()

Time calculation

Property mapping

scrubbers[]

startTime, endTime, duration

transitions: {[id]: Transition}
```

Key transformations performed:

```
startTime: scrubber.left / pixelsPerSecond,

endTime: (scrubber.left + scrubber.width) / pixelsPerSecond,

duration: scrubber.width / pixelsPerSecond,

trackIndex: scrubber.y || 0,
```

The function also:

* Collects all transitions from all tracks into a single map keyed by transition ID
* Preserves trim information (`trimBefore`, `trimAfter`) for video/audio scrubbers
* Maintains player-specific positioning (`left_player`, `top_player`, `width_player`, `height_player`)
* Includes grouped scrubber references and transition IDs

**Sources:** app/hooks/useTimeline.ts150-214

### Constants and Configuration

The timeline system uses several key constants that define its behavior:

| Constant | Value | Purpose |
| --- | --- | --- |
| `PIXELS_PER_SECOND` | 100 | Base timeline resolution |
| `DEFAULT_TRACK_HEIGHT` | 60 | Track visual height in pixels |
| `MIN_ZOOM` / `MAX_ZOOM` | 0.25 / 4 | Zoom level constraints |
| `FPS` | 30 | Frame rate for time calculations |
| `SNAP_DISTANCE` | 10 | Pixel threshold for snapping |

**Sources:** app/components/timeline/types.ts99-107

## Video Composition Engine

The core composition engine transforms timeline data into Remotion components through the `TimelineComposition` function. This component handles track grouping, media content creation, and transition management.

```
Output Components

Transition Processing

Content Generation

Timeline Processing

timelineData[]

trackGroups{}

Sorted by startTime

createMediaContent()

Text AbsoluteFill

Img Component

Video Component

Audio Component

getTransitionPresentation()

getTransitionTiming()

TransitionSeries.Transition

Sequence Components

AbsoluteFill Container

TimelineComposition
```

The composition engine processes timeline data in several phases:

| Phase | Function | Purpose |
| --- | --- | --- |
| Track Grouping | `trackGroups[trackIndex]` | Groups scrubbers by track for layered rendering |
| Content Creation | `createMediaContent()` | Converts scrubber data to React components |
| Transition Processing | `getTransitionPresentation()` | Applies visual effects between clips |
| Sequence Assembly | `TransitionSeries` | Combines content and transitions into timeline |

## Media Content Rendering

The `createMediaContent` function handles different media types and converts them into appropriate Remotion components based on the scrubber's `mediaType` property.

```
Audio Rendering

Video Rendering

Image Rendering

Text Rendering

Media Type Detection

scrubber.mediaType

'text'

'image'

'video'

'audio'

'groupped_scrubber'

AbsoluteFill

fontSize, fontFamily, color

element

AbsoluteFill

![]({imageUrl})

left_player, top_player

AbsoluteFill

[]({videoUrl})

trimBefore, trimAfter

trimBefore, trimAfter
```

The system supports URL resolution for both preview and render modes:

* **Preview Mode**: Uses `mediaUrlLocal` for immediate playback
* **Render Mode**: Uses `mediaUrlRemote` or falls back to `mediaUrlLocal`

## Rendering Pipeline

The rendering pipeline handles the conversion from composition to final video file through a dedicated Express server that uses Remotion's rendering engine.

```
Optimization Settings

Remotion Rendering

Render Server

Frontend Trigger

useRenderer hook

POST /render

timelineData, dimensions

videorender.ts

bundleLocation

selectComposition()

renderMedia()

codec: 'h264'

ffmpegOverride

out/TimelineComposition.mp4

concurrency: 3

preset: 'fast'

crf: '28'

maxrate: '5M'
```

The rendering process includes several optimization steps:

1. **Bundle Creation**: Remotion bundles the composition code at server startup
2. **Composition Selection**: Server selects the `TimelineComposition` with input props
3. **Rendering**: Uses FFmpeg with optimized settings for server hardware
4. **File Delivery**: Returns the rendered MP4 file to the client

## Caption System

The caption system provides TikTok-style animated text overlays using Remotion's caption utilities. The system supports multiple caption styles and timing configurations.

```
Animation Effects

Rendering Components

Page Generation

Caption Data Structure

captions: Caption[]

text: string

startMs, endMs, timestampMs

confidence: number

createTikTokStyleCaptions()

combineTokensWithinMilliseconds

pages: CaptionPageData[]

tokens: {text, fromMs, toMs}[]

CaptionPage component

spring() animation

GlassySubtitlePage

AlternativeCaptionStyle

interpolate opacity

interpolate scale

absolute positioning

backdrop-filter: blur()
```

The caption system supports three main styling approaches:

| Style | Component | Features |
| --- | --- | --- |
| TikTok Style | `CaptionPage` | Individual word animations, scaling effects |
| Glassy Subtitles | `GlassySubtitlePage` | Backdrop blur, gradient text, bottom positioning |
| Alternative Style | `AlternativeCaptionStyle` | Top positioning, outline text, highlighting |

The caption system is demonstrated in app/routes/learn.tsx and leverages Remotion's `@remotion/captions` package to create TikTok-style animated captions with word-by-word timing.

### Caption Data Structure

Captions are defined using two primary interfaces:

```
type Caption = {

text: string;           // Individual word or phrase

startMs: number;        // Start time in milliseconds

endMs: number;          // End time in milliseconds

timestampMs: number | null;    // Optional emphasis timestamp

confidence: number | null;     // Speech recognition confidence (0-1)

}

type CaptionPageData = {

text: string;           // Full text for this page

startMs: number;        // Page start time

durationMs: number;     // Page duration

tokens: Array<{

text: string;         // Individual token text

fromMs: number;       // Token start time

toMs: number;         // Token end time

}>;

}
```

**Sources:** app/routes/learn.tsx13-30

### Caption Page Generation

The system uses Remotion's `createTikTokStyleCaptions` to group individual caption words into pages:

```
Caption[]  
Individual words with timing

createTikTokStyleCaptions()  
@remotion/captions

CaptionPageData[]  
Grouped word pages

combineTokensWithinMilliseconds  
Controls grouping
```

**Sources:** app/routes/learn.tsx107-110

### Caption Timing Configuration

The `combineTokensWithinMilliseconds` parameter controls how words are grouped into pages:

* **Standard (1200ms)** - Groups words within 1.2 seconds, typical pacing
* **Quick (600ms)** - Faster word switching, more dynamic
* **Slow (2000ms)** - More words per page, slower transitions

**Sources:** app/routes/learn.tsx107-110 app/routes/learn.tsx416-424

## Preview vs Render Modes

The system operates in two distinct modes: preview mode for real-time editing and render mode for final video export. The `isRendering` flag controls behavior differences between these modes.

| Aspect | Preview Mode | Render Mode |
| --- | --- | --- |
| Player Component | `@remotion/player` | `renderMedia()` |
| URL Resolution | `mediaUrlLocal` first | `mediaUrlRemote` first |
| Pixel Calculation | `getPixelsPerSecond()` | Static number value |
| Interactive Elements | `SortedOutlines` enabled | Disabled |
| Performance | Optimized for interactivity | Optimized for quality |

```
Render Behavior

Preview Behavior

Mode Detection

isRendering: boolean

false

true

@remotion/player

mediaUrlLocal

SortedOutlines

Live preview

renderMedia()

mediaUrlRemote

No outlines

Optimized encoding
```

## Core Data Structure: MediaBinItem

All media assets in the editor are represented by the `MediaBinItem` interface, which serves as the unified data structure for video files, images, audio tracks, text elements, and grouped scrubbers.

| Property | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique identifier (UUID for local items, database ID for uploaded assets) |
| `name` | `string` | Display name of the asset |
| `mediaType` | `"video" | "image" | "audio" | "text" | "groupped_scrubber"` | Asset type discriminator |
| `mediaUrlLocal` | `string | null` | Browser blob URL for local preview during upload |
| `mediaUrlRemote` | `string | null` | Server URL after successful upload (relative path like `/media/filename.mp4`) |
| `durationInSeconds` | `number` | Duration for time-based media (video/audio) |
| `media_width` | `number` | Visual width for video/image |
| `media_height` | `number` | Visual height for video/image |
| `text` | `TextConfig | null` | Text configuration for text-type items |
| `isUploading` | `boolean` | Upload in progress flag |
| `uploadProgress` | `number | null` | Upload percentage (0-100) |
| `left_transition_id` | `string | null` | Linked transition effect on left edge |
| `right_transition_id` | `string | null` | Linked transition effect on right edge |
| `groupped_scrubbers` | `ScrubberState[] | null` | Child scrubbers for grouped items |

**Sources:** app/hooks/useMediaBin.ts3

## Caption Rendering Styles

The learn.tsx demonstration file showcases four distinct caption rendering styles, each implemented as a React component that renders within Remotion sequences.

### Style 1: TikTok-Style Captions (CaptionPage)

Individual tokens animate in with spring physics and scale effects, positioned centrally with drop shadows.

```
tokenOpacity  
tokenScale

CaptionPage Component

page.tokens.map()

spring() animation  
Per-token timing

findPositionForToken()  
left: 50%, top: 80%

fontSize: 3rem  
fontWeight: bold  
textShadow: 2px 2px 4px

Animated
```

**Key Properties:**

* Font size: `3rem`
* Position: Center-bottom (`50%`, `80%`)
* Animation: Spring-based opacity and scale
* Shadow: `2px 2px 4px rgba(0, 0, 0, 0.8)`

**Sources:** app/routes/learn.tsx116-208

### Style 2: Alternative Caption Style

Top-aligned captions with active word highlighting and stroke effects.

* Position: Top `10%`, centered horizontally
* Font: Impact with `2px` letter spacing
* `-webkit-text-stroke: 1px black`
* Active token: Yellow (`#ffff00`) with glow effect
* Inactive token: White with reduced opacity

**Sources:** app/routes/learn.tsx238-286

### Style 3: Glassy Subtitle Style (GlassySubtitlePage)

Bottom overlay with glassmorphism design, all tokens visible simultaneously with active word emphasis.

```
Container  
position: absolute, bottom: 8%

Glassmorphism  
backdrop-filter: blur(12px)

border: 1px solid rgba(255,255,255,0.22)  
borderRadius: 18

boxShadow: 0 10px 30px

Token Base Style  
fontSize: clamp(18px, 3.2vw, 36px)  
fontWeight: 800

backgroundImage: linear-gradient  
-webkit-background-clip: text

Active Token  
opacity: 1

Inactive Token  
opacity: 0.35, blur(0.2px)
```

**Sources:** app/routes/learn.tsx289-352

### Style 4: Alternating Captions

Cycles through all three styles based on page index modulo 3.

**Sources:** app/routes/learn.tsx379-409

## Caption Rendering Pipeline

```
Caption[] Array  
Word-level timing data

createTikTokStyleCaptions()  
combineTokensWithinMilliseconds: 1200

pages: CaptionPageData[]

TikTokStyleCaptionsExample  
AbsoluteFill Component

pages.map()

Sequence  
from: (startMs/1000)*fps  
duration: (durationMs/1000)*fps

CaptionPage Component  
or GlassySubtitlePage  
or AlternativeCaptionStyle

useCurrentFrame()

useVideoConfig()  
fps: 30

Token-level Animation  
spring() based
```

**Sources:** app/routes/learn.tsx210-235 app/routes/learn.tsx354-376

## Caption Player Integration

The learn.tsx route provides a demonstration page with multiple players showing different caption styles simultaneously:

```
learn.tsx Route  
CaptionsPlayer Component

Player 1  
TikTokStyleCaptionsExample  
1080x1920, 30fps

Player 2  
CaptionsShowcase  
Multiple timing configs

Player 3  
GlassySubtitlesExample  
Glassmorphism only

Player 4  
AlternatingCaptionsExample  
Rotating styles

videoConfig  
width: 1080  
height: 1920  
fps: 30  
duration: 350 frames
```

Each player is configured for vertical video format (1080x1920) at 30fps with 350 frames duration (approximately 11.7 seconds).

**Sources:** app/routes/learn.tsx458-570

### Remotion Player Integration

The player uses `@remotion/player` with the following configuration:

| Property | Value | Purpose |
| --- | --- | --- |
| `component` | `TimelineComposition` | Main composition component |
| `inputProps` | `{ timelineData, durationInFrames, compositionWidth, compositionHeight, getPixelsPerSecond, isRendering: false }` | Timeline state and dimensions |
| `durationInFrames` | Calculated from max scrubber end time | Total composition length |
| `compositionWidth` | From `DimensionControls` or auto-detected | Output width |
| `compositionHeight` | From `DimensionControls` or auto-detected | Output height |
| `fps` | `FPS` constant (30) | Frame rate |
| `ref` | `playerRef` | Programmatic control access |

**Player Control Methods:**

```
interface PlayerRef {

play: () => void;

pause: () => void;

seekTo: (frame: number) => void;

getCurrentFrame: () => number;

addEventListener: (event: 'frameupdate' | 'seeked', handler: Function) => void;

removeEventListener: (event: string, handler: Function) => void;

}
```

**Sources:** app/hooks/useRuler.ts6-9 app/hooks/useRuler.ts99-133 app/components/timeline/types.ts21-22

## Control Components

### Asset Upload

**POST** `/api/assets/upload`

Uploads new media files by proxying to the render service at port 8000, then records metadata in the database.

**Request Headers:**

* `x-media-width`: Media width in pixels (optional)
* `x-media-height`: Media height in pixels (optional)
* `x-media-duration`: Media duration in seconds (optional)
* `x-original-name`: Original filename
* `x-project-id`: Associated project ID (optional)

**Request Body:** `multipart/form-data` with `media` field

```
{

"success": true,

"asset": {

"id": "uuid",

"name": "filename.mp4",

"mediaUrlRemote": "/api/assets/uuid/raw",

"fullUrl": "http://localhost:8000/media/storage_key.mp4",

"width": 1920,

"height": 1080,

"durationInSeconds": 30.5,

"size": 1024000

}

}
```

Sources: app/routes/api.assets.$.tsx182-264 app/lib/assets.repo.ts46-81

### Asset Registration

**POST** `/api/assets/register`

Registers a file that already exists in the `out/` directory without uploading.

**Request Body:**

```
{

"filename": "existing_file.mp4",

"originalName": "My Video.mp4",

"size": 1024000,

"width": 1920,

"height": 1080,

"duration": 30.5

}
```

Sources: app/routes/api.assets.$.tsx267-330

### Asset Operations

**DELETE** `/api/assets/:id`

* Soft deletes database record via `softDeleteAsset()`
* Removes physical file from `out/` directory
* Validates user ownership before deletion

**POST** `/api/assets/:id/clone`

* Creates physical copy of asset file with timestamp suffix
* Inserts new database record with modified name
* Preserves original metadata (dimensions, duration, MIME type)

Sources: app/routes/api.assets.$.tsx333-421 app/lib/assets.repo.ts114-127

## Projects API

The Projects API handles project lifecycle management and integrates with timeline state storage.

### Endpoints Summary

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/projects` | List user's projects |
| GET | `/api/projects/:id` | Get project with timeline state |
| POST | `/api/projects` | Create new project |
| DELETE | `/api/projects/:id` | Delete project and cascade assets |
| PATCH | `/api/projects/:id` | Update project name/timeline/textBinItems |

### Project Data Flow

```
Project State Components

api.projects.$.tsx

projects.repo.ts

timeline.store.ts

assets.repo.ts

PostgreSQL  
projects table

project_data/  
{projectId}.json

PostgreSQL  
assets table

TimelineState  
tracks, scrubbers, transitions

MediaBinItem[]  
text elements

ProjectRecord  
id, name, user_id, timestamps
```

**Project State Management Architecture**

Sources: app/routes/api.projects.$.tsx1-260 app/lib/projects.repo.ts1-99 app/lib/timeline.store.ts1-97

### Project Listing and Retrieval

**GET** `/api/projects`

Returns all projects owned by the authenticated user, ordered by creation date.

```
{

"projects": [

{

"id": "uuid",

"user_id": "user-uuid",

"name": "My Video Project",

"created_at": "2024-01-01T12:00:00Z",

"updated_at": "2024-01-02T15:30:00Z"

}

]

}
```

**GET** `/api/projects/:id`

Retrieves project metadata combined with timeline state from JSON storage.

```
{

"project": {

"id": "uuid",

"user_id": "user-uuid",

"name": "My Video Project",

"created_at": "2024-01-01T12:00:00Z",

"updated_at": "2024-01-02T15:30:00Z"

},

"timeline": {

"tracks": [

{

"id": "track-1",

"scrubbers": [],

"transitions": []

}

]

},

"textBinItems": []

}
```

Sources: app/routes/api.projects.$.tsx60-84 app/lib/timeline.store.ts47-71

### Project Creation and Management

**POST** `/api/projects`

Creates a new project with default timeline structure.

```
{

"name": "Project Name"

}
```

**PATCH** `/api/projects/:id`

Updates project metadata and/or timeline state. Supports partial updates.

```
{

"name": "Updated Name",

"timeline": { /* TimelineState object */ },

"textBinItems": [ /* MediaBinItem array */ ]

}
```

Sources: app/routes/api.projects.$.tsx147-256 app/lib/projects.repo.ts37-52

### Project Deletion with Cascade

**DELETE** `/api/projects/:id`

Performs cascading deletion of project and associated resources:

1. **Asset Cleanup**: Lists all assets via `listAssetsByUser(userId, projectId)`
2. **File Removal**: Deletes physical files from `out/` directory with path traversal protection
3. **Database Cleanup**: Soft deletes asset records via `softDeleteAsset()`
4. **Project Removal**: Hard deletes project record via `deleteProjectById()`
5. **Timeline Cleanup**: Removes timeline JSON file from `project_data/`

Sources: app/routes/api.projects.$.tsx87-136 app/routes/api.projects.$.tsx158-189

## Storage API

The Storage API provides user storage quota information.

### Storage Usage Endpoint

**GET** `/api/storage`

Returns current storage usage statistics for the authenticated user.

```
{

"usedBytes": 1073741824,

"limitBytes": 2147483648

}
```

**Implementation Details:**

* Queries `user_storage` materialized view in PostgreSQL
* Default limit: 2GB per user
* Handles both string and numeric storage values from database
* Creates transient database connection pool

Sources: app/routes/api.storage.$.tsx53-102

## Error Handling

The authentication API implements minimal error handling, primarily around session retrieval:

```
Error Responses

Error Scenarios

Session Retrieval Error

Better Auth Handler Error

OAuth Flow Error

console.error() Logging

Fall-through to Better Auth

Normalized 200 Response
```

**Sources:** app/routes/api.auth.$.tsx17-19

The route handler uses a try-catch block around session normalization but allows most errors to be handled by Better Auth's internal error handling mechanisms. This ensures that authentication errors are properly communicated to clients while providing graceful handling for common "no session" scenarios.

## Asset Upload Flow

### Upload Asset Endpoint

**Endpoint:** `POST /api/assets/upload`

**Authentication:** Required (session cookie)

**Request Format:**

```
Content-Type: multipart/form-data

Body:
  media: <File>

Headers:
  X-Media-Width: <string>         // Pixel width (0 for audio)
  X-Media-Height: <string>        // Pixel height (0 for audio)
  X-Media-Duration: <string>      // Duration in seconds
  X-Original-Name: <string>       // Original filename
  X-Project-Id: <string>          // Associated project ID (optional)
```

```
{

"success": true,

"asset": {

"id": "uuid-generated-by-database",

"name": "example.mp4",

"mediaUrlRemote": "/media/example-1704067200000.mp4",

"width": 1920,

"height": 1080,

"durationInSeconds": 10.5

}

}
```

**Upload Process Diagram:**

```
PostgreSQL"out/Directory""Backend Service:8000/upload""Frontend API/api/assets/upload"useMediaBinBrowserUserPostgreSQL"out/Directory""Backend Service:8000/upload""Frontend API/api/assets/upload"useMediaBinBrowserUser"Generate temporary UUID""Create video/img/audio elementExtract width, height, duration""Authenticate userValidate project access""Select file""handleAddMediaToBin(file)""URL.createObjectURL(file)""Local blob URL""getMediaMetadata(file)""Add to mediaBinItems[]isUploading: trueuploadProgress: 0""POST FormData+ metadata headers""Forward upload request""multer.diskStoragecreateSafeFilename()""Write file with timestamp""File saved""Upload confirmation""INSERT INTO assets""Return asset record with ID""{ asset: { id, mediaUrlRemote, ... } }""Replace temp UUID with DB IDisUploading: false""Asset ready in media bin"
```

Sources: app/hooks/useMediaBin.ts224-317 app/videorender/videorender.ts37-126

The upload implements an **optimistic UI pattern**. The frontend immediately adds the asset to the media bin with a temporary UUID and local blob URL (`mediaUrlLocal`) while the upload proceeds in the background. Progress is tracked via `axios.onUploadProgress` callback and stored in `uploadProgress` field.

Upon successful upload, the backend generates a unique filename using `createSafeFilename()` which appends a timestamp app/videorender/videorender.ts44-48 The frontend then replaces the temporary UUID with the database-generated ID and swaps `mediaUrlLocal` for `mediaUrlRemote` app/hooks/useMediaBin.ts295-307

**File Size Limit:** 500MB per file app/videorender/videorender.ts54

**Allowed File Types:**

* Video: `.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`, `.flv`, `.wmv`, `.m4v`
* Audio: `.mp3`, `.wav`, `.aac`, `.ogg`, `.flac`
* Image: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`

Sources: app/videorender/videorender.ts56-64

## List Assets Endpoint

**Endpoint:** `GET /api/assets`

```
{

"assets": [

{

"id": "asset-uuid",

"name": "video.mp4",

"mediaUrlRemote": "/media/video-1704067200000.mp4",

"width": 1920,

"height": 1080,

"durationInSeconds": 15.3

}

]

}
```

This endpoint is called on page load to hydrate the media bin with existing assets for the authenticated user and current project app/hooks/useMediaBin.ts173-222 The response is validated against `AssetsResponseSchema` before being added to state.

**Asset Type Inference:**

Since the database doesn't store an explicit `mediaType` field, the client infers it from the file extension:

| Extension Pattern | Media Type |
| --- | --- |
| `.mp4`, `.mov`, `.webm`, `.mkv`, `.avi` | `video` |
| `.mp3`, `.wav`, `.aac`, `.ogg`, `.flac` | `audio` |
| `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp` | `image` |

Sources: app/hooks/useMediaBin.ts190-196

## Delete Asset Endpoint

**Endpoint:** `DELETE /api/assets/{id}`

```
{

"success": true,

"message": "Asset deleted successfully"

}
```

### Type-Specific Deletion Strategy

The deletion logic implements different strategies based on the asset's `mediaType`:

```
text OR  
groupped_scrubber

video, image,  
audio

true

false

handleDeleteMedia(item)

item.mediaType

Remove from mediaBinItems[]  
(no server call)

DELETE /api/assets/{id}

handleDeleteScrubbersByMediaBinId(id)

Complete

Remove from out/ directory

DELETE FROM assets table

res.ok?

Remove from mediaBinItems[]

Log error, keep in UI

handleDeleteScrubbersByMediaBinId(id)

Complete
```

Sources: app/hooks/useMediaBin.ts378-412

**Cascading Deletion:**

When an asset is deleted, all timeline scrubbers referencing it via `sourceMediaBinId` are automatically removed by calling `handleDeleteScrubbersByMediaBinId(item.id)` app/hooks/useMediaBin.ts384-403 This prevents orphaned timeline references.

**Client-Only Assets:**

Text items and grouped scrubbers are UI-only constructs that don't correspond to physical files on disk. These are removed directly from the `mediaBinItems` state without making API calls app/hooks/useMediaBin.ts382-388

## Clone Asset Endpoint

**Endpoint:** `POST /api/assets/{id}/clone`

```
{

"suffix": "(Audio)"

}
```

```
{

"success": true,

"asset": {

"id": "new-asset-uuid",

"mediaUrlRemote": "/media/video-1704067200000-(Audio).mp4",

"name": "video.mp4 (Audio)"

}

}
```

### Use Case: Audio Track Extraction

The primary use case for cloning is the **Split Audio** feature, which creates a separate audio-only asset from a video file app/hooks/useMediaBin.ts414-462

**Split Audio Flow:**

```
"out/Directory""Backend API/api/assets/{id}/clone"useMediaBinContextMenuUser"out/Directory""Backend API/api/assets/{id}/clone"useMediaBinContextMenuUser"Right-click video itemSelect 'Split Audio'""handleSplitAudio(videoItem)""Validate mediaType === 'video'""POST { suffix: '(Audio)' }""fs.copyFileSync(source, dest)Add timestamp + suffix""File copied""Record in database""{ asset: { mediaUrlRemote, ... } }""Create MediaBinItem:mediaType: 'audio'name: 'video.mp4 (Audio)'durationInSeconds: (same)width: 0, height: 0""Add audioItem to mediaBinItems[]""Audio asset appears in media bin"
```

Sources: app/hooks/useMediaBin.ts414-462 app/videorender/videorender.ts166-219

**Backend Implementation:**

The server uses `fs.copyFileSync()` to duplicate the file and `createSafeFilename()` to generate a unique destination filename with the provided suffix app/videorender/videorender.ts188-198 This allows the same video file to be referenced by both a video and audio asset without duplicating storage (though the current implementation does copy the file).

## Internal Media Serving

**Endpoint:** `GET /media/{filename}`

**Access:** Internal Docker network only (not accessible from browser)

This endpoint serves media files to the Remotion rendering engine. It is **not exposed through the Nginx reverse proxy** to browsers. All browser access to media must go through authenticated API endpoints.

**Security Measures:**

1. **Path Traversal Prevention:** Uses `safeResolveOutPath()` to validate filenames app/videorender/videorender.ts74-78
2. **File Existence Check:** Returns 404 if file not found app/videorender/videorender.ts80-83
3. **Nginx Blocking:** The production Nginx configuration denies direct `/media/*` access from external requests

**URL Format in Timeline Data:**

Media items on the timeline reference files using relative URLs like `/media/filename-1704067200000.mp4`. During rendering, the Remotion composition running on the backend service resolves these URLs against `http://localhost:8000` (internal Docker network).

Sources: app/videorender/videorender.ts68-91

The rendering service exposes an internal endpoint for serving media files to the Remotion composition during rendering:

```
app.get("/media/:filename", (req: Request, res: Response): void => {

try {

const filename = req.params.filename;

const decodedFilename = decodeURIComponent(filename);

// Safely resolve the file path

const filePath = safeResolveOutPath(decodedFilename);

if (!filePath) {

res.status(403).json({ error: "Invalid filename" });

return;

}

if (!fs.existsSync(filePath)) {

res.status(404).json({ error: "File not found" });

return;

}

// Serve the file for internal use

res.sendFile(filePath);

} catch (error) {

console.error("Error serving media file:", error);

res.status(500).json({ error: "Failed to serve file" });

}

});
```

**Important:** This endpoint is designed for Docker network access only and should not be exposed to the public internet. The Nginx reverse proxy blocks direct access to `/media/*` paths from external clients. Media files are instead served through the authenticated Assets API (see Assets API).

## Asset Lifecycle State Diagram

Sources: app/hooks/useMediaBin.ts1-535

## File Storage and Naming

### Storage Directory Structure

All media assets are stored in the `out/` directory at the repository root:

```
out/
├── video-1704067200000.mp4
├── image-1704067300000.png
├── audio-1704067400000.mp3
├── video-1704067500000-(Audio).mp4
└── TimelineComposition.mp4  (rendered output)
```

### Filename Generation

The `createSafeFilename()` utility generates unique filenames by appending a timestamp:

**Format:** `{basename}-{timestamp}{suffix}.{extension}`

**Example:**

* Original: `my-video.mp4`
* Generated: `my-video-1704067200000.mp4`
* With suffix: `my-video-1704067200000-(Audio).mp4`

This prevents filename collisions while preserving the original basename for user identification.

Sources: app/videorender/videorender.ts44-48

### Path Security

All file operations use `safeResolveOutPath()` to prevent path traversal attacks:

```
// Validates filename contains no directory separators

// Resolves path relative to out/ directory only

// Returns null if validation fails
```

Functions like file serving app/videorender/videorender.ts74 deletion app/videorender/videorender.ts227 and cloning app/videorender/videorender.ts176 all validate paths before performing file system operations.

## Asset Type System

### MediaBinItem Interface

Assets in the media bin are represented by the `MediaBinItem` type:

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Database-generated UUID or temp client UUID |
| `name` | `string` | Display name (original filename or text content) |
| `mediaType` | `"video" | "image" | "audio" | "text" | "groupped_scrubber"` | Asset classification |
| `mediaUrlLocal` | `string | null` | Blob URL for local preview during upload |
| `mediaUrlRemote` | `string | null` | Server URL path (e.g., `/media/file.mp4`) |
| `durationInSeconds` | `number` | Media duration (0 for images/text) |
| `media_width` | `number` | Pixel width (0 for audio/text) |
| `media_height` | `number` | Pixel height (0 for audio/text) |
| `text` | `object | null` | Text styling properties (only for text items) |
| `isUploading` | `boolean` | Upload in progress flag |
| `uploadProgress` | `number | null` | Upload percentage (0-100) |
| `left_transition_id` | `string | null` | Transition effect reference |
| `right_transition_id` | `string | null` | Transition effect reference |
| `groupped_scrubbers` | `object | null` | Nested scrubbers for grouped items |

Sources: app/hooks/useMediaBin.ts3

### Type-Specific Behavior

**Video Assets:**

* Full metadata (width, height, duration)
* Can be cloned to extract audio
* Served via internal `/media/` endpoint during rendering

**Image Assets:**

* Width and height only (no duration)
* Static display in composition

**Audio Assets:**

* Duration only (width=0, height=0)
* Typically created via Split Audio from video
* Rendered as audio track without visual representation

**Text Assets:**

* Client-only (never uploaded to server)
* Stored in `text` object with styling properties
* No `mediaUrlRemote` field

**Grouped Scrubber Assets:**

* Client-only composite of multiple timeline items
* Stored in `groupped_scrubbers` array
* Allows reusing complex timeline arrangements

## Rendering API

This document describes the video rendering endpoint exposed by the Backend Service. The rendering API accepts timeline data from the frontend and produces a rendered MP4 video file using Remotion and FFmpeg.

For information about uploading and managing media assets, see [Assets API](./backend-readme.md). For AI-powered editing capabilities, see [AI API](./ai-backend-readme.md).

## Endpoint Overview

The rendering service exposes the following endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/render` | Main video rendering endpoint - converts timeline data to MP4 |
| `GET` | `/health` | System health check - returns memory usage and uptime |
| `GET` | `/media/:filename` | Internal media serving for Remotion composition (Docker network only) |

**Sources:** app/videorender/videorender.ts265-349 app/videorender/videorender.ts252-263 app/videorender/videorender.ts68-91

## POST /render Endpoint

### Request Format

The rendering endpoint accepts a JSON request body with the following structure:

```
{

timelineData: TimelineDataItem[],

durationInFrames: number,

compositionWidth: number,

compositionHeight: number,

getPixelsPerSecond: number

}
```

#### Request Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `timelineData` | `TimelineDataItem[]` | Yes | Array of timeline items containing scrubbers and transitions |
| `durationInFrames` | `number` | Yes | Total video duration in frames (calculated as `maxEndTime * FPS`) |
| `compositionWidth` | `number` | Yes | Output video width in pixels |
| `compositionHeight` | `number` | Yes | Output video height in pixels |
| `getPixelsPerSecond` | `number` | No | Pixels-per-second zoom value (for internal use) |

The `timelineData` parameter is an array of `TimelineDataItem` objects, where each item contains:

* `scrubbers`: Array of media elements with timing, positioning, and properties
* `transitions`: Object mapping transition IDs to transition configurations

Each scrubber in the timeline data includes:

* Media metadata (`mediaType`, `media_width`, `media_height`, URLs)
* Timing information (`startTime`, `endTime`, `duration`)
* Player positioning (`left_player`, `top_player`, `width_player`, `height_player`)
* Trimming data (`trimBefore`, `trimAfter` in frames)
* Track assignment (`trackIndex`)
* Text properties (if `mediaType: "text"`)
* Transition references (`left_transition_id`, `right_transition_id`)

**Sources:** app/videorender/videorender.ts265-284 app/components/timeline/types.ts82-100 app/hooks/useRenderer.ts84-105

### Dimension Calculation

If the frontend does not provide explicit dimensions, the `useRenderer` hook calculates them by finding the maximum width and height across all media in the timeline:

```
// Calculate composition width if not provided

if (compositionWidth === null) {

let maxWidth = 0;

for (const item of timelineData) {

for (const scrubber of item.scrubbers) {

if (scrubber.media_width !== null && scrubber.media_width > maxWidth) {

maxWidth = scrubber.media_width;

}

}

}

compositionWidth = maxWidth || 1920; // Default to 1920 if no media found

}
```

This ensures the composition canvas is large enough to contain all media elements. If no media is found, it defaults to 1920×1080.

**Sources:** app/hooks/useRenderer.ts38-68

### Response Format

The endpoint returns the rendered video file as a binary blob with content type `video/mp4`. The file is streamed directly to the client using Express's `res.sendFile()` method.

On success:

* **Status Code:** `200 OK`
* **Content-Type:** `video/mp4`
* **Body:** Binary MP4 file

On error:

* **Status Code:** `500 Internal Server Error`
* **Content-Type:** `application/json`
* **Body:**

```
{

"error": "Video rendering failed",

"message": "Your laptop might be under heavy load. Try closing other apps and rendering again.",

"tip": "Videos are limited to 5 seconds at half resolution for performance."

}
```

**Sources:** app/videorender/videorender.ts328 app/videorender/videorender.ts343-347

## Rendering Process Flow

The following diagram illustrates the complete rendering pipeline from frontend request to video download:

**Diagram: Video Rendering Pipeline**

```
"out/ Directory""FFmpeg Process""Remotion Renderer""/render Endpoint""/health Endpoint""useRenderer Hook""out/ Directory""FFmpeg Process""Remotion Renderer""/render Endpoint""/health Endpoint""useRenderer Hook""Verify server connectivity(5 second timeout)""15 minute timeoutresponseType: blob""Apply optimizedencoding parameters""GET /health""200 OK {status, memory, uptime}""Calculate durationInFrames(maxEndTime * FPS)""Calculate dimensions(max media size or defaults)""POST /render{timelineData, durationInFrames,compositionWidth, compositionHeight}""selectComposition()id: TimelineCompositioninputProps: {timelineData, ...}""composition object""renderMedia()codec: h264concurrency: 3""Access media files via/media/:filename""Media file data""Bundle frames + encodepreset: fast, crf: 28threads: 3""Write out/TimelineComposition.mp4""Encoding complete""Render complete""Read out/TimelineComposition.mp4""MP4 file data""200 OK (stream MP4 blob)""Create blob URLTrigger download""Cleanup blob URL"
```

**Sources:** app/videorender/videorender.ts265-349 app/hooks/useRenderer.ts14-159 app/videorender/Composition.tsx4-61

## Remotion Bundling

Before the server starts accepting render requests, it creates a Remotion bundle containing the video composition code. This bundle is created once at server startup and reused for all render requests:

```
const bundleLocation = await bundle({

entryPoint: path.resolve("./app/videorender/index.ts"),

webpackOverride: (config) => config,

});
```

The bundle includes:

* `TimelineComposition` component from app/video-compositions/VideoPlayer
* Remotion composition configuration from app/videorender/Composition.tsx
* All dependencies required for rendering

This pre-bundling approach eliminates the need to rebuild the composition on each render request, significantly improving performance.

**Sources:** app/videorender/videorender.ts15-19

## Composition Selection

The render endpoint uses `selectComposition()` to retrieve the composition metadata:

```
const composition = await selectComposition({

serveUrl: bundleLocation,

id: compositionId,  // "TimelineComposition"

inputProps,

});
```

The composition ID is hardcoded as `"TimelineComposition"` and must match the ID defined in the Remotion composition:

```
<Composition

id="TimelineComposition"

component={TimelineComposition}

durationInFrames={(inputProps.durationInFrames as number) ?? 300}

fps={30}

width={inputProps.compositionWidth as number}

height={inputProps.compositionHeight as number}

// ...

/>
```

**Sources:** app/videorender/videorender.ts11 app/videorender/videorender.ts280-284 app/videorender/Composition.tsx8-14

## Rendering Configuration

### Core Settings

The `renderMedia()` function is configured with the following parameters:

| Parameter | Value | Purpose |
| --- | --- | --- |
| `codec` | `"h264"` | Standard video codec for broad compatibility |
| `concurrency` | `3` | Use 3 CPU cores, leaving 1 for system operations |
| `outputLocation` | `"out/TimelineComposition.mp4"` | Fixed output path (overwritten on each render) |
| `verbose` | `true` | Enable detailed logging for debugging |
| `logLevel` | `"info"` | Log important rendering events |
| `timeoutInMilliseconds` | `900000` | 15-minute timeout for longer videos |

**Sources:** app/videorender/videorender.ts290-324

### FFmpeg Optimization

The rendering service applies custom FFmpeg parameters optimized for the target infrastructure (4vCPU, 8GB RAM):

```
ffmpegOverride: ({ args }) => {

return [

...args,

"-preset", "fast",              // Balance speed and quality

"-crf", "28",                   // Constant Rate Factor (quality level)

"-threads", "3",                // Use 3 threads for encoding

"-tune", "film",                // Optimize for general video content

"-x264-params", "ref=3:me=hex:subme=6:trellis=1",  // Quality settings

"-g", "30",                     // Keyframe interval (1 per second at 30fps)

"-bf", "2",                     // Allow 2 B-frames for compression

"-maxrate", "5M",               // Limit bitrate to prevent memory issues

"-bufsize", "10M",              // Buffer size for rate control

];

}
```

#### Parameter Breakdown

| Parameter | Value | Impact |
| --- | --- | --- |
| `preset` | `fast` | Good balance between encoding speed and file size |
| `crf` | `28` | Quality level (0-51, lower is better; 28 is acceptable quality) |
| `threads` | `3` | Parallel encoding on 3 cores |
| `tune` | `film` | Optimizes encoder for live-action content |
| `ref` | `3` | Number of reference frames for motion estimation |
| `me` | `hex` | Hexagonal motion estimation (fast) |
| `subme` | `6` | Subpixel motion estimation quality |
| `trellis` | `1` | Rate-distortion optimization level |
| `g` | `30` | GOP size (group of pictures) - one keyframe per second |
| `bf` | `2` | Maximum number of B-frames between I/P frames |
| `maxrate` | `5M` | Maximum bitrate cap (5 Mbps) |
| `bufsize` | `10M` | Video buffer size for rate control |

**Sources:** app/videorender/videorender.ts301-323

## Error Handling and Cleanup

### Render Failures

When rendering fails, the server attempts to clean up partial output files:

```
catch (err) {

console.error("❌ Render failed:", err);

// Clean up failed renders

try {

const outputPath = `out/${compositionId}.mp4`;

if (fs.existsSync(outputPath)) {

fs.unlinkSync(outputPath);

console.log("🧹 Cleaned up partial file");

}

} catch (cleanupErr) {

console.warn("⚠️ Could not clean up:", cleanupErr);

}

res.status(500).json({

error: "Video rendering failed",

message: "Your laptop might be under heavy load...",

tip: "Videos are limited to 5 seconds at half resolution for performance."

});

}
```

This prevents corrupted or incomplete video files from accumulating in the output directory.

**Sources:** app/videorender/videorender.ts329-348

### Rendering Speed

Actual rendering time depends on:

* Video duration (`durationInFrames`)
* Number of media elements in the timeline
* Complexity of transitions and effects
* Video resolution (`compositionWidth` × `compositionHeight`)

The `fast` preset provides a good balance between speed and quality, typically rendering at 5-15x real-time speed (e.g., a 60-second video may render in 4-12 seconds).

### Timeout Configuration

| Component | Timeout | Purpose |
| --- | --- | --- |
| Frontend health check | 5 seconds | Quick connectivity verification |
| Frontend render request | 900,000 ms (15 min) | Maximum time for complete render + download |
| Backend render operation | 900,000 ms (15 min) | Maximum time for Remotion rendering process |

**Sources:** app/videorender/videorender.ts290-325 app/hooks/useRenderer.ts108

## Validation and Prerequisites

Before sending a render request, the frontend performs several validation checks:

1. **Server Connectivity:** Verifies the backend is reachable via `/health`
2. **Timeline Content:** Ensures at least one track has scrubbers
3. **Dimension Calculation:** Computes or validates `compositionWidth` and `compositionHeight`
4. **Duration Calculation:** Computes `durationInFrames` from maximum scrubber end time

If any validation fails, the render request is aborted with an appropriate error message.

**Sources:** app/hooks/useRenderer.ts27-80

## API Response Codes

| Status Code | Condition | Response Body |
| --- | --- | --- |
| `200` | Render successful | MP4 file (binary) |
| `500` | Render failed | `{error, message, tip}` JSON object |
| `400` | Invalid request (not explicitly implemented) | N/A |

The backend does not currently implement explicit request validation. Invalid requests will typically fail during the Remotion rendering phase and return a 500 error.

## AI API

This document describes the FastAPI-based AI service that processes natural language commands for video editing operations. The service translates user messages into structured function calls that modify timeline state, media bin items, or composition settings. For general API reference, see [API Reference](./backend-readme.md). For authentication endpoints, see [Authentication API](./auth-readme.md).

## Endpoint Specification

### POST `/ai`

Processes natural language commands and returns structured function calls or assistant messages.

#### Terminal 2: Backend Service (Video Rendering)

* Runs the Express server for video rendering
* Initializes Remotion bundler
* Creates `out/` directory for media storage
* **Listens on:** `http://localhost:8000`
* **Ready when:** "Server running on port 8000" appears

#### Terminal 3: FastAPI Service (AI Backend)

```
cd backend

uv run main.py
```

* Starts FastAPI application with Uvicorn
* Initializes Gemini AI client (requires `GEMINI_API_KEY`)
* **Listens on:** `http://localhost:3000`
* **Ready when:** "Uvicorn running on <http://0.0.0.0:3000>" appears

### Service Startup Sequence

```
"PostgreSQL""FastAPI Process(Port 3000)""Backend Process(Port 8000)""Frontend Process(Port 5173)""Developer""PostgreSQL""FastAPI Process(Port 3000)""Backend Process(Port 8000)""Frontend Process(Port 5173)""Developer""pnpm dlx tsx app/videorender/videorender.ts""Load environment variables""Initialize Express server""Create out/ directory""Test connection (DATABASE_URL)""✓ Server running on port 8000""uv run main.py""Load environment variables""Initialize Gemini client""Test connection (DATABASE_URL)""✓ Uvicorn running on http://0.0.0.0:3000""pnpm run dev""Load environment variables""Start Vite dev server""Compile React Router routes""Test connection (DATABASE_URL)""Health check (fetch http://localhost:8000)""Health check (fetch http://localhost:3000)""✓ React Router dev server ready"
```

**Sources:** README.md89-94 package.json6-14

### 2. Backend Health Check

```
curl http://localhost:8000/health
```

**Expected response:**

```
{"status": "ok"}
```

### Remotion Bundling Errors

**Symptom:** Backend fails with "Cannot find module" or bundling errors

**Solution:** Ensure all dependencies are installed and Remotion can access FFmpeg

```
pnpm install --frozen-lockfile

# Remotion will download FFmpeg automatically on first render
```

**Sources:** package.json33-40

## Development Workflow

Once services are running, the typical development workflow:

| Task | Command | Description |
| --- | --- | --- |
| Type checking | `pnpm run typecheck` | Run TypeScript compiler and React Router type generation |
| Linting | `pnpm run lint` | Execute ESLint on `.ts` and `.tsx` files |
| Formatting (check) | `pnpm run format:check` | Verify code matches Prettier configuration |
| Formatting (fix) | `pnpm run format` | Auto-format all files with Prettier |
| Build production | `pnpm run build` | Create optimized production bundle |

This document outlines the development workflow for contributing to the Kimu video editor project, including pull request processes, automated quality assurance, and code standards. This covers the contribution mechanics and CI/CD pipeline.

For development environment setup instructions, see [Getting Started](./deployment-readme.md). For architectural patterns and component design, see [Component Architecture](./frontend-readme.md). For contribution guidelines and licensing information, see [Contributing Guidelines](#7.2).

### Hot Reload Behavior

* **Frontend:** Vite HMR updates browser instantly on file changes in `app/`
* **Backend:** Requires manual restart (no auto-reload in development)
* **FastAPI:** Uvicorn auto-reloads on file changes in `backend/`

**Sources:** package.json11-14 .prettierrc1-12

## Next Steps

After successfully running the development environment:

1. **Explore the Editor:** Navigate to `http://localhost:5173/editor` to access the timeline editor (requires authentication)
2. **Review Architecture:** Read System Architecture to understand how services communicate
3. **Study Data Types:** See Data Types and Interfaces for core TypeScript interfaces
4. **Understand State Management:** Read State Management Architecture for the custom hooks pattern
5. **Configure AI Features:** Obtain `GEMINI_API_KEY` to enable AI Assistant (Vibe AI))

For production deployment with Nginx reverse proxy and TLS, see [Infrastructure and Deployment](./deployment-readme.md).

**Sources:** README.md1-170

## Rendering Types

