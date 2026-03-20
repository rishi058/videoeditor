### Timeline Editing Flow

```
RemotionPlayeruseTimelineTimelineEditorUserRemotionPlayeruseTimelineTimelineEditorUser"Convert to TimelineDataItem[]""Drag media to track""handleUpdateScrubber()""Update TimelineState""snapshotTimeline() for undo""getTimelineData()""Render preview"
```

### Timeline Editor Layout

The main editor interface (`TimelineEditor` component) implements a complex resizable panel layout:

**Editor Layout Structure**

```
Main Container  
h-screen flex flex-col

Header Bar  
h-9 border-b  
Logo, Project Name, Actions

Main Content  
flex flex-1

Activity Bar  
w-12 shrink-0  
VSCode-style sidebar

ResizablePanelGroup  
horizontal direction

LeftPanel  
ResizablePanel  
Media/Text/Transitions

ResizableHandle

Center Area  
ResizablePanel  
Preview + Timeline

ResizablePanelGroup  
vertical direction

Preview Panel  
VideoPlayer + Controls

Timeline Panel  
Ruler + Tracks

Chat Panel  
ResizablePanel  
AI Assistant
```

The layout uses the `react-resizable-panels` library for user-adjustable panel sizes. The left panel can be collapsed via the activity bar, with state tracked in app/routes/home.tsx84-85

**Panel Size Defaults:**

| Panel | Default Size | Min Size | Max Size | Collapsible |
| --- | --- | --- | --- | --- |
| Left (Media Bin) | 20% | 15% | 40% | Yes (0%) |
| Center (Preview + Timeline) | 55-80% | — | — | No |
| Right (Chat) | 25% | 20% | 50% | Yes |

**Sources:** app/routes/home.tsx747-1037 app/routes/home.tsx861-900

## Timeline System

The timeline is the central organizing structure for video editing. It consists of multiple parallel tracks, each containing scrubbers (media elements) that represent video clips, images, audio, or text positioned along a time axis.

This document covers the timeline editing system, which provides the core non-linear video editing interface. The system manages multi-track timeline state, scrubber (media element) positioning, user interactions, and real-time preview coordination.

For information about video composition and rendering from timeline data, see [Video Composition and Rendering](./backend-readme.md). For media asset management, see [Media Management](./frontend-readme.md).

### Core Concepts

**Scrubber**: A scrubber is the fundamental unit of media on the timeline. Each scrubber represents a single media element with properties for position (`left`, `y`), duration (`width`), media source URLs, and player positioning (`left_player`, `top_player`, `width_player`, `height_player`).

**Track**: A track is a horizontal container for scrubbers. Tracks are stacked vertically and allow parallel media playback.

**Zoom Level**: The timeline supports zoom from 10% to 1000% of the base resolution, where `PIXELS_PER_SECOND = 100` at 100% zoom. All scrubber positions and widths are stored in pixel units and scale with zoom changes.

**Source Media Bin ID**: Each scrubber maintains a `sourceMediaBinId` reference linking it back to the original asset in the media bin, enabling asset updates to propagate to all timeline instances.

The detailed technical implementation of the timeline, including collision detection, snap behavior, and state management, is documented in Timeline System.

Sources: app/hooks/useTimeline.ts18-143 app/components/timeline/types.ts

## Media Management

The media management system handles the lifecycle of assets from upload through deletion. It supports video, image, audio, and text assets with optimistic UI updates during upload.

### Upload Flow

1. User selects files via `<input type="file">` or drag-and-drop
2. `useMediaBin.handleAddMediaToBin` extracts metadata (dimensions, duration)
3. Asset is immediately added to media bin with local blob URL and temporary UUID
4. Background upload to `POST /api/assets/upload` with progress tracking
5. Server responds with database ID and remote URL
6. Local blob URL is replaced with remote URL in media bin state

### Asset Types

* **Video**: `.mp4`, `.webm`, `.mov` - duration extracted via `HTMLVideoElement`
* **Image**: `.jpg`, `.png`, `.gif` - dimensions extracted via `Image()`
* **Audio**: `.mp3`, `.wav`, `.ogg` - duration extracted via `HTMLAudioElement`
* **Text**: Created via Text Editor, stored only in application state
* **Grouped Scrubbers**: Compositions of multiple scrubbers bundled together

For detailed media bin implementation and asset lifecycle, see [Media Management](./frontend-readme.md).

Sources: app/routes/home.tsx433-462 app/hooks/useMediaBin.ts

### Timeline Zoom

The zoom system scales the entire timeline while preserving time relationships. Zoom levels range from `MIN_ZOOM = 0.1` (10%) to `MAX_ZOOM = 10` (1000%) with a default of `DEFAULT_ZOOM = 1.0` (100%).

**Zoom Operations**:

* `handleZoomIn()`: Multiplies zoom by 1.5 (max 1000%)
* `handleZoomOut()`: Divides zoom by 1.5 (min 10%)
* `handleZoomReset()`: Returns to 100%
* Ctrl+Scroll Wheel: Zoom at cursor position

When zoom changes, all scrubber positions and widths are recalculated:

```
// Example from useTimeline.ts:82-101

const zoomRatio = newZoom / currentZoom;

scrubbers.map(scrubber => ({

...scrubber,

left: scrubber.left * zoomRatio,

width: scrubber.width * zoomRatio,

}))
```

### Playhead Ruler

The ruler shows the current playback position and allows seeking by dragging. It's managed by `useRuler`:

**Key Functions**:

* `handleRulerMouseDown()`: Initiates ruler drag
* `handleRulerMouseMove()`: Updates position during drag
* `updateRulerFromPlayer()`: Syncs ruler with video player frame updates
* `handleRulerDrag()`: Seeks video player to ruler position

The ruler position is stored in pixels (`rulerPositionPx`) and converted to time using `pixelsPerSecond = PIXELS_PER_SECOND * zoomLevel`.

Sources: app/hooks/useTimeline.ts77-143 app/hooks/useRuler.ts app/routes/home.tsx719-743

## Advanced Editing Features

### Grouping and Ungrouping

Grouping allows multiple scrubbers to be combined into a single draggable unit:

```
Select Multiple Scrubbers  
Ctrl+Click

handleGroupScrubbers()  
Create grouped_scrubber

Grouped Scrubber  
mediaType: 'groupped_scrubber'  
groupped_scrubbers: ScrubberState[]

handleUngroupScrubber()  
Restore individual scrubbers

handleMoveGroupToMediaBin()  
Save composition to media bin
```

Grouped scrubbers preserve the relative positions and properties of their constituent scrubbers. When ungrouped, positions are scaled based on how the group was resized. Groups can be saved to the media bin for reuse across the timeline or in other projects.

Sources: app/hooks/useTimeline.ts1333-1519 app/routes/home.tsx571-600

### Splitting at Playhead

The split operation divides a scrubber at the current ruler position while preserving trim settings:

**Algorithm** (app/hooks/useTimeline.ts655-735):

1. Calculate split time from ruler position: `splitTimeInSeconds = rulerPositionPx / pixelsPerSecond`
2. Verify split point is within scrubber bounds (excluding edges)
3. Calculate split frame offset in original media: `splitFrameInOriginal = currentTrimBefore + splitFrameOffset`
4. Create two new scrubbers:
   * First: `trimBefore = currentTrimBefore`, `trimAfter = originalDuration - splitFrame`
   * Second: `trimBefore = splitFrame`, `trimAfter = currentTrimAfter`
5. Replace original scrubber with the two new scrubbers

This approach ensures that trimmed video segments maintain their original media references and frame-accurate trim points.

Sources: app/hooks/useTimeline.ts655-735 app/routes/home.tsx546-569

### Transition System

Transitions create visual effects between adjacent scrubbers or at the beginning/end of individual scrubbers. The system supports:

**Transition Types**:

* `fade`: Gradual opacity transition
* `slide`: Directional slide effect
* Additional types defined in transition catalog

**Placement Rules** (enforced by `validateTransitionPlacement`):

1. Transition duration cannot exceed adjacent scrubber durations
2. No two transitions can be placed adjacent to each other
3. Regular transitions require both left and right scrubbers
4. Intro/outro transitions require only one scrubber

**Overlap Behavior**: When a transition is added between two scrubbers within snap distance (`SNAP_DISTANCE = 10px`), the right scrubber automatically repositions to create the required overlap:

```
// From useTimeline.ts:989-999

if (shouldMoveScrubbersTogetherForOverlap()) {

const newLeft = leftScrubber.left + leftScrubber.width - transitionWidthPx;

return { ...scrubber, left: newLeft, left_transition_id: updatedTransition.id };

}
```

Connected scrubbers (those sharing transitions) move together as a unit, with collision detection applied to the entire group.

For detailed transition implementation, see [Timeline System](./timeline-readme.md).

Sources: app/hooks/useTimeline.ts737-1120 app/components/timeline/TimelineTracks.tsx

## Keyboard Shortcuts and Global Controls

The editor provides comprehensive keyboard control:

| Shortcut | Action | Implementation |
| --- | --- | --- |
| Space | Play/Pause | app/routes/home.tsx650-686 |
| Ctrl+S / Cmd+S | Save Timeline | app/routes/home.tsx388-431 |
| Ctrl+Z / Cmd+Z | Undo | app/routes/home.tsx401-405 |
| Ctrl+Shift+Z / Cmd+Shift+Z | Redo | app/routes/home.tsx407-411 |
| Delete | Delete Selected | app/routes/home.tsx414-422 |
| Ctrl+Scroll / Cmd+Scroll | Zoom Timeline | app/routes/home.tsx719-743 |

All shortcuts respect input focus state to avoid interference with text editing.

Sources: app/routes/home.tsx388-431 app/routes/home.tsx650-686 app/routes/home.tsx719-743

### Track Container (`TimelineTracks`)

The `TimelineTracks` component manages the visual container for all timeline tracks, handling scrolling, track controls, and coordinate calculations for drag-and-drop operations.

```
Event Handlers

TimelineTracks Responsibilities

Track Controls Column

Scrollable Timeline Area

Playhead Line

Drop Event Handling

Coordinate Calculation

onDropOnTrack()

onDropTransitionOnTrack()

onSelectScrubber()
```

**Sources:** app/components/timeline/TimelineTracks.tsx44-324

### Scrubber Elements (`Scrubber`)

Individual `Scrubber` components represent media elements on the timeline with interactive capabilities including dragging, resizing, and context menus.

| Feature | Implementation | Code Reference |
| --- | --- | --- |
| Drag Operations | Mouse event handling with position snapping and track switching | app/components/timeline/Scrubber.tsx110-181 |
| Resize Handles | Left/right edge detection and width adjustment (disabled for video/audio) | app/components/timeline/Scrubber.tsx182-241 |
| Snapping | Grid and scrubber edge alignment with configurable snap distance | app/components/timeline/Scrubber.tsx68-106 |
| Context Menu | Right-click menu with group/ungroup/delete options | app/components/timeline/Scrubber.tsx329-416 |
| Selection | Visual selection state, multi-selection with Ctrl+click, keyboard shortcuts | app/components/timeline/Scrubber.tsx275-297 |
| Color Coding | Different colors per media type (video/image/text/audio/grouped) | app/components/timeline/Scrubber.tsx300-326 |

**Sources:** app/components/timeline/Scrubber.tsx31-551

### Scrubber Update Pipeline

The system uses a sophisticated update pipeline to handle scrubber modifications while maintaining consistency across connected elements and preventing collisions.

```
"Undo Stack""Connected Elements""Collision Detection""useTimeline Hook""Scrubber Component"User"Undo Stack""Connected Elements""Collision Detection""useTimeline Hook""Scrubber Component"Useralt["Not applying history"]alt["Track changed"]["Same track"]"Drag scrubber""handleMouseMove()""findSnapPoint()""onUpdate(updatedScrubber)""handleUpdateScrubber()""Push current state""Clear redo stack""Find current track""Remove from old track""Add to new track""Update in place""State update""Visual feedback"
```

**Sources:** app/hooks/useTimeline.ts279-337 app/components/timeline/Scrubber.tsx141-256

### Undo/Redo System

The timeline implements a session-based undo/redo system that maintains history stacks for timeline operations.

```
TimelineState

User Action

snapshotTimeline()

undoStack[]

redoStack[]

State Update

undo()

redo()
```

| Function | Purpose | Implementation |
| --- | --- | --- |
| `snapshotTimeline` | Captures current state before changes | Deep clones timeline, pushes to undo stack, clears redo stack |
| `undo` | Reverts to previous state | Pops from undo stack, pushes current to redo stack, applies state |
| `redo` | Re-applies undone changes | Pops from redo stack, pushes current to undo stack, applies state |

The undo stack is capped at 100 states to prevent memory issues. The system uses `isApplyingHistoryRef` to prevent creating new undo entries when navigating history.

**Sources:** app/hooks/useTimeline.ts33-71 app/routes/home.tsx401-412

### Zoom Operation Flow

Zoom operations require coordinated updates to all scrubber positions and widths to maintain temporal relationships.

```
Zoom Trigger (handleZoomIn/Out/Reset)

zoomLevelRef.current

Calculate newZoom

zoomRatio = newZoom / currentZoom

Map all tracks and scrubbers

scrubber.left *= zoomRatio

scrubber.width *= zoomRatio

setTimeline(updated tracks)

setZoomLevel(newZoom)

zoomLevelRef.current = newZoom
```

Zoom levels are constrained between `MIN_ZOOM` (0.25) and `MAX_ZOOM` (4), with zoom operations using a 1.5x multiplier. The zoom level is stored in both state and a ref to enable immediate access during calculations.

**Sources:** app/hooks/useTimeline.ts82-143

## User Interaction Systems

### Drag and Drop System

The timeline supports drag-and-drop operations for both media items from the media bin and transitions from the transitions panel.

| Drop Target | Handler | Coordinate Calculation |
| --- | --- | --- |
| Timeline Track | `onDropOnTrack` | `e.clientX - containerBounds.left + scrollLeft` |
| Transition Drop | `onDropTransitionOnTrack` | Same coordinate system with track detection |

The system uses consistent coordinate calculation across all drop operations:

```
const dropXInTimeline = e.clientX - containerBounds.left + scrollLeft;

const dropYInTimeline = e.clientY - containerBounds.top + scrollTop;

let trackIndex = Math.floor(dropYInTimeline / DEFAULT_TRACK_HEIGHT);
```

When dropping media items, the system performs several operations:

1. Validates the dropped data using `MediaBinItemSchema.parse()`
2. Calculates initial width based on media type and duration
3. For grouped scrubbers, generates new UUIDs to prevent ID collisions
4. Creates a new `ScrubberState` with default player position properties
5. Takes an undo snapshot via `snapshotTimeline()`

**Sources:** app/components/timeline/TimelineTracks.tsx167-209 app/hooks/useTimeline.ts550-653

### Multi-Selection System

The timeline supports selecting multiple scrubbers for batch operations like grouping or deletion.

```
No

Yes

Yes

No

Click/Ctrl+Click Event

Ctrl Key Pressed?

setSelectedScrubberIds([scrubberId])

Already Selected?

Remove from selection

Add to selection

Group Selected (Ctrl+G or Context Menu)

handleGroupScrubbers()

Create groupped_scrubber MediaBinItem
```

Selected scrubbers receive visual highlighting with a ring effect and can be manipulated together. The selection system integrates with keyboard shortcuts (Delete key) and context menu actions.

**Sources:** app/routes/home.tsx524-581 app/components/timeline/Scrubber.tsx110-138 app/hooks/useTimeline.ts1074-1166

### Grouping and Ungrouping

The grouping system allows combining multiple scrubbers into a single composite element that can be reused.

```
"Media Bin"handleGroupScrubbers"useTimeline""home.tsx"User"Media Bin"handleGroupScrubbers"useTimeline""home.tsx"User"Select multiple scrubbers""Click Group (context menu)""handleGroupScrubbers(selectedIds)""Process selected scrubbers""Deep clone scrubbers with transitions""Calculate bounding box""Normalize positions to relative""handleAddGroupToMediaBin()""Delete original scrubbers""New grouped item appears"
```

Grouped scrubbers:

* Store nested scrubbers in `groupped_scrubbers` array
* Preserve transitions between grouped elements
* Maintain relative positioning when dropped
* Can be ungrouped to restore original scrubbers
* Generate new UUIDs when dropped to prevent ID collisions

**Sources:** app/hooks/useTimeline.ts1074-1166 app/hooks/useTimeline.ts1168-1259 app/hooks/useTimeline.ts472-547

### Splitting at Playhead

The split function divides a scrubber at the current ruler position while preserving trim information for video/audio.

```
No/Multiple

Yes

No

Yes

Split Action (Scissors Button)

Scrubber Selected?

Ruler Within Scrubber?

Calculate split point in frames

Create first scrubber with adjusted trimAfter

Create second scrubber with adjusted trimBefore

Replace original with two scrubbers

Clear selection

Show error toast
```

The split operation:

* Works at frame-level precision (30 FPS)
* Preserves `trimBefore` and `trimAfter` for video/audio elements
* Creates two new scrubbers with unique IDs
* Maintains temporal continuity of the original media
* Takes an undo snapshot before splitting

**Sources:** app/hooks/useTimeline.ts655-735 app/routes/home.tsx546-569

### Ruler and Playhead System

The ruler system provides time navigation and playhead positioning with bidirectional synchronization between the timeline and video player.

```
PlayerPlayerRefuseRulerTimelineRulerUserPlayerPlayerRefuseRulerTimelineRulerUser"Click ruler position""handleRulerDrag(newPositionPx)""Convert px to frames""seekTo(frame)""Seek to frame""frameupdate event""updateRulerFromPlayer(frame)""Convert frames to px""Update rulerPositionPx""Playhead moves"
```

| Feature | Implementation | Details |
| --- | --- | --- |
| Time Display | Editable timestamp | Format: HH:MM:SS.mmm, supports multiple input formats |
| Tick Marks | Adaptive density | Major (10s/5s/1s), minor (1s), micro (0.5s/0.25s/0.1s), frame-level |
| Playhead Handle | Draggable control | 8px square at top of ruler, synchronized with player |
| Snapping | Optional grid alignment | Configurable snap distance (default 10px) |
| Scroll Sync | Position tracking | Ruler content translates with timeline scroll |

The ruler uses `isSeekingRef` and `isUpdatingFromPlayerRef` flags to prevent feedback loops during bidirectional synchronization.

**Sources:** app/hooks/useRuler.ts1-145 app/components/timeline/TimelineRuler.tsx1-481 app/routes/home.tsx627-647

### Timeline Expansion

The timeline automatically expands when the user scrolls or drags near the right edge.

```
Yes

No

Scroll or Drag Event

Calculate distance to edge

Distance < 200px?

expandTimeline()

timelineWidth += 1000

Maintain scroll position

Continue normal operation
```

The expansion system:

* Triggers when within 200px (`EXPANSION_THRESHOLD`) of the right edge
* Adds 1000px (`EXPANSION_AMOUNT`) to the timeline width
* Activates during scroll, drag operations, and resize operations
* Maintains user scroll position to prevent jarring jumps

**Sources:** app/hooks/useTimeline.ts224-240 app/components/timeline/Scrubber.tsx168-180

### Transition Management

Transitions create visual effects between adjacent scrubbers and enable overlapping positioning that would normally be prevented by collision detection.

| Transition Property | Purpose | Validation |
| --- | --- | --- |
| `leftScrubberId` | Source scrubber ID | Must exist and have sufficient duration |
| `rightScrubberId` | Target scrubber ID | Must exist and have sufficient duration |
| `durationInFrames` | Effect duration | Cannot exceed either scrubber's duration |
| `presentation` | Visual effect type | One of: fade, wipe, clockWipe, slide, flip, iris |

**Sources:** app/hooks/useTimeline.ts551-590 app/components/timeline/types.ts17-25

## Data Transformation

## Transitions and Effects

The transition system uses Remotion's `@remotion/transitions` package to create smooth effects between video clips. Transitions are stored in the timeline data and processed during composition.

| Transition Type | Implementation | Timing Options |
| --- | --- | --- |
| `fade` | `fade()` | `spring`, `linear` |
| `wipe` | `wipe()` | `spring`, `linear` |
| `slide` | `slide()` | `spring`, `linear` |
| `flip` | `flip()` | `spring`, `linear` |
| `iris` | `iris({width: 1000, height: 1000})` | `spring`, `linear` |

```
Final Output

Remotion Components

Processing Functions

Transition Configuration

transition: Transition

presentation: 'fade'|'wipe'|'slide'

timing: 'spring'|'linear'

durationInFrames: number

getTransitionPresentation()

getTransitionTiming()

fade()

wipe()

slide()

springTiming()

linearTiming()

TransitionSeries.Transition
```

### Grouped Scrubbers

Grouped scrubbers allow users to collapse multiple timeline elements into a single reusable media bin item. Created via `handleAddGroupToMediaBin`.

**Creation process:**

1. Receives a `ScrubberState` object representing the group
2. Receives `currentPixelsPerSecond` for duration calculation
3. Calculates actual duration: `width / currentPixelsPerSecond` (app/hooks/useMediaBin.ts495)
4. Creates `MediaBinItem` with `mediaType: "groupped_scrubber"`
5. Stores child scrubbers in `groupped_scrubbers` array

**Duration calculation rationale:**
The pixel width of a scrubber varies with zoom level (`pixelsPerSecond`). To store the true duration independent of zoom, the function divides the current pixel width by the current zoom factor.

**Sources:** app/hooks/useMediaBin.ts491-517

## Context Menu System

The media bin supports right-click context menus for asset-specific actions.

### Context Menu State

```
contextMenu: {

x: number;        // Screen X coordinate

y: number;        // Screen Y coordinate

item: MediaBinItem; // Target media item

} | null
```

### Context Menu Actions

| Action | Applicable To | Implementation |
| --- | --- | --- |
| Delete | All media types | `handleDeleteFromContext` → `handleDeleteMedia` |
| Split Audio | Video only | `handleSplitAudioFromContext` → `handleSplitAudio` |

**Event flow:**

1. User right-clicks media bin item → `handleContextMenu(e, item)` (app/hooks/useMediaBin.ts465-472)
2. Sets `contextMenu` state with position and item
3. UI renders context menu at coordinates
4. User clicks action → corresponding handler executes
5. Context menu closed via `handleCloseContextMenu()` (app/hooks/useMediaBin.ts487-489)

**Sources:** app/hooks/useMediaBin.ts464-489

## Complete Asset Lifecycle

**Key lifecycle stages:**

1. **Selection & Metadata** (app/hooks/useMediaBin.ts224-243): File chosen, type validated, metadata extracted
2. **Optimistic UI** (app/hooks/useMediaBin.ts246-262): Immediate addition to media bin with temporary UUID
3. **Upload & Progress** (app/hooks/useMediaBin.ts264-289): Background upload with percentage tracking
4. **Server Storage** (app/hooks/useMediaBin.ts291-307): File saved to `out/` directory, database record created
5. **Timeline Integration**: Asset can be dragged to timeline, creating linked `ScrubberState` objects
6. **Operations**: Split audio (video only), delete (type-specific)
7. **Deletion Cascade**: Removing asset triggers timeline scrubber cleanup

**Sources:** app/hooks/useMediaBin.ts1-535

## Text and Captions

This document covers the text editing and caption rendering capabilities in Kimu Video Editor. Text functionality includes both static text overlays created through the TextEditor component and dynamic TikTok-style captions rendered using Remotion's caption utilities.

For information about how text elements are stored and managed in the timeline, see [Timeline System](./timeline-readme.md). For rendering these elements as part of final video output, see [Video Composition and Rendering](./backend-readme.md).

## Text Editor Component

The `TextEditor` component provides a UI for creating styled text elements that can be added to the timeline. It is accessed via a route in the editor and provides real-time preview of text styling.

## Integration with Timeline System

While the caption demonstrations exist in learn.tsx as standalone compositions, text created via TextEditor integrates with the main timeline system:

1. **Text Creation** - User configures text in TextEditor component
2. **Callback Invocation** - `onAddText` callback provided by outlet context
3. **Media Bin Addition** - Text becomes a MediaBinItem (type: "text")
4. **Timeline Placement** - User drags text item to timeline, creating a ScrubberState
5. **Rendering** - Text properties are passed to TimelineComposition for final render

The caption system demonstrated in learn.tsx shows potential future integration patterns for adding automated caption generation and rendering to timeline projects.

**Sources:** app/components/media/TextEditor.tsx17-26 app/components/media/TextEditor.tsx48-53

## Animation Timing Calculations

Caption animations synchronize token appearance with precise frame-based timing:

```
// Convert milliseconds to frames

const tokenRelativeStartFrame = ((token.fromMs - page.startMs) / 1000) * fps;

// Spring animation offset from token start

const tokenProgress = spring({

frame: frame - tokenRelativeStartFrame,

fps,

config: { damping: 12, stiffness: 150 }

});

// Interpolate opacity and scale

const tokenOpacity = interpolate(tokenProgress, [0, 0.3], [0, 1]);

const tokenScale = interpolate(tokenProgress, [0, 0.3], [0.9, 1]);
```

This ensures each token animates independently based on its timing within the parent page sequence.

**Sources:** app/routes/learn.tsx157-175 app/routes/learn.tsx263-265 app/routes/learn.tsx338-340

## User Interface Components

This page catalogs the key UI components in Kimu's frontend, focusing on implementation details and code structure. The components are organized into functional groups: timeline components, video player section, control interfaces, and marketing pages.

For timeline state management implementation, see [Timeline System](./timeline-readme.md) (3.1). For authentication flow, see [Authentication and Security](./auth-readme.md) (4).

## Timeline Components

The timeline system consists of three primary rendering components: `TimelineTracks`, `Scrubber`, and `TimelineRuler`. These components work together to provide the timeline editing interface.

### Timeline Component Architecture

```
TimelineTracks

Track Control Column

Scrollable Timeline Area

Playhead Line Overlay

Track Background Divs

Grid Line Overlays

Scrubber Components

TransitionOverlay Components

Delete Track Buttons

Track Index Labels

Drag Handler

Resize Handles

Right-click Context Menu

TimelineRuler

Time Markers

Playhead Drag Handle

Timestamp Display

onDelete

onGroupScrubbers

onUngroupScrubber

onMoveToMediaBin
```

**Sources:** app/components/timeline/TimelineTracks.tsx1-329 app/components/timeline/Scrubber.tsx1-551 app/components/timeline/TimelineRuler.tsx1-481

### TimelineTracks Component

`TimelineTracks` renders the track container with scrolling, drag-and-drop support, and scrubber management.

**Interface:**

```
interface TimelineTracksProps {

timeline: TimelineState;

timelineWidth: number;

rulerPositionPx: number;

containerRef: React.RefObject<HTMLDivElement | null>;

onScroll: () => void;

onDeleteTrack: (trackId: string) => void;

onUpdateScrubber: (updatedScrubber: ScrubberState) => void;

onDeleteScrubber?: (scrubberId: string) => void;

onBeginScrubberTransform?: () => void;

onDropOnTrack: (item: MediaBinItem, trackId: string, dropLeftPx: number) => void;

onDropTransitionOnTrack: (transition: Transition, trackId: string, dropLeftPx: number) => void;

onDeleteTransition: (transitionId: string) => void;

getAllScrubbers: () => ScrubberState[];

expandTimeline: () => boolean;

onRulerMouseDown: (e: React.MouseEvent) => void;

pixelsPerSecond: number;

selectedScrubberIds: string[];

onSelectScrubber: (scrubberId: string | null, ctrlKey: boolean) => void;

onGroupScrubbers: () => void;

onUngroupScrubber: (scrubberId: string) => void;

onMoveToMediaBin?: (scrubberId: string) => void;

}
```

**Key Implementation Details:**

| Feature | Implementation |
| --- | --- |
| **Track Layout** | Fixed-width control column (28 units) + scrollable timeline area |
| **Track Height** | `DEFAULT_TRACK_HEIGHT` constant (48px per track) |
| **Grid Lines** | Rendered every `pixelsPerSecond` with 5-second emphasis |
| **Scroll Sync** | Track controls translate with `scrollTop` via CSS transform |
| **Drop Zones** | `onDrop` handler calculates track index from Y position |
| **Playhead Render** | Absolute positioned div at `rulerPositionPx` with full track height |

**Sources:** app/components/timeline/TimelineTracks.tsx17-39 app/components/timeline/TimelineTracks.tsx97-329 app/components/timeline/types.ts8-12

### Scrubber Component

`Scrubber` represents individual media elements on the timeline with drag, resize, and selection capabilities.

```
interface ScrubberProps {

scrubber: ScrubberState;

timelineWidth: number;

otherScrubbers: ScrubberState[];

onUpdate: (updatedScrubber: ScrubberState) => void;

onDelete?: (scrubberId: string) => void;

containerRef: React.RefObject<HTMLDivElement | null>;

expandTimeline: () => boolean;

snapConfig: SnapConfig;

trackCount: number;

pixelsPerSecond: number;

isSelected?: boolean;

onSelect: (scrubberId: string, ctrlKey: boolean) => void;

onGroupScrubbers: () => void;

onUngroupScrubber: (scrubberId: string) => void;

onMoveToMediaBin?: (scrubberId: string) => void;

selectedScrubberIds: string[];

onBeginTransform?: () => void;

}
```

**Visual Styling by Media Type:**

| Media Type | Base Color | Selected Ring | Resize Handles |
| --- | --- | --- | --- |
| `video` | `bg-primary` | `ring-primary/50` | Disabled |
| `audio` | `bg-blue-600` | `ring-blue-400/50` | Disabled |
| `image` | `bg-green-600` | `ring-green-400/50` | Enabled |
| `text` | `bg-purple-600` | `ring-purple-400/50` | Enabled |
| `groupped_scrubber` | `bg-gray-600` | `ring-gray-400/50` | Disabled |

**Interaction Handlers:**

* **Drag:** Updates `left` and `y` properties, auto-scrolls container near edges
* **Resize:** Left/right handles adjust `left`/`width` with `MINIMUM_WIDTH` constraint (20px)
* **Snap:** Snaps to grid marks and other scrubber edges within `snapConfig.distance` (10px)
* **Track Change:** Mouse Y position divided by `DEFAULT_TRACK_HEIGHT` determines target track
* **Context Menu:** Right-click shows Group/Ungroup/Delete options at cursor position

**Sources:** app/components/timeline/Scrubber.tsx11-29 app/components/timeline/Scrubber.tsx300-326 app/components/timeline/Scrubber.tsx110-256 app/components/timeline/Scrubber.tsx418-549

### TimelineRuler Component

`TimelineRuler` displays time markers and handles playhead seeking.

```
interface TimelineRulerProps {

timelineWidth: number;

rulerPositionPx: number;

containerRef: React.RefObject<HTMLDivElement | null>;

onRulerDrag: (newPositionPx: number) => void;

onRulerMouseDown: (e: React.MouseEvent) => void;

pixelsPerSecond: number;

scrollLeft: number;

}
```

**Time Marker Hierarchy:**

| Marker Type | Interval | Visibility Threshold | Height | Opacity |
| --- | --- | --- | --- | --- |
| Major | 10s / 5s / 1s (adaptive) | Always shown | 16px | 100% |
| Mid-major | 5s (when major=10s) | `pixelsPerSecond * 5 >= 64` | 12px | 80% |
| Minor | 1s | `pixelsPerSecond >= 6` | 12px | 60% |
| Micro | 0.5s | `pixelsPerSecond * 0.5 >= 6` | 8px | 30% |
| Micro-quarter | 0.25s | `pixelsPerSecond * 0.25 >= 10` | 6px | 20% |
| Micro-tenth | 0.1s | `pixelsPerSecond * 0.1 >= 14` | 4px | 10% |
| Frame | `1/FPS` | `pixelsPerSecond * (1/30) >= 18` | 2px | 10% |

**Timestamp Formats:**

* **Display:** `HH:MM:SS.mmm` format with editable input
* **Major marks:** `MM:SS` format
* **Sub-second:** `MM:SS.tenths` or `MM:SS.hundredths` based on granularity
* **Frame marks:** `MM:SS:FF` format (every 10th frame labeled)

**Time Input Parsing:**

The ruler accepts multiple time input formats:

* `mm:ss.ms` (e.g., "1:30.500")
* `ss.ms` (e.g., "90.500")
* `ss` (plain seconds)
* `120f` (frame number with 'f' suffix)

**Sources:** app/components/timeline/TimelineRuler.tsx5-23 app/components/timeline/TimelineRuler.tsx116-182 app/components/timeline/TimelineRuler.tsx60-99

## Video Player Section

The video player section combines Remotion's `@remotion/player` with playback controls and composition rendering.

### Player Component Structure

```
Video Player Container

@remotion/player

Playback Control Bar

TimelineComposition

playerRef

per track

/![]()/

Play/Pause Toggle

Seek Bar

Volume Button

Maximize Button

useRuler hook

Ruler Position Sync

frameupdate events
```

**Sources:** app/components/videorender/VideoPlayer.tsx1-100 (referenced in system), app/hooks/useRuler.ts1-146 app/videorender/TimelineComposition.tsx1-200 (referenced in system)

### TimelineControls Component

`TimelineControls` provides the main action buttons and dimension controls for the timeline.

**Subcomponents:**

```
TimelineControls

TimelineTitle

DimensionControls

MediaActionButtons

TrackActionButton

RenderActionButtons

Width Input

Height Input

Auto-size Checkbox

Add Media Button

Add Text Button

Render Video Button

Log Timeline Data
```

```
interface TimelineControlsProps {

onAddMedia: () => void;

onAddText: () => void;

onAddTrack: () => void;

onRenderVideo: () => void;

onLogTimelineData: () => void;

isRendering: boolean;

width: number;

height: number;

onWidthChange: (width: number) => void;

onHeightChange: (height: number) => void;

isAutoSize: boolean;

onAutoSizeChange: (auto: boolean) => void;

}
```

**Sources:** app/components/timeline/TimelineControls.tsx8-21 app/components/timeline/TimelineControls.tsx37-66

### TextEditor Component

`TextEditor` provides text creation with styling controls and live preview.

**Form Controls:**

| Control | Type | Range/Options | State Variable |
| --- | --- | --- | --- |
| Content | `<textarea>` | Multi-line text | `textContent` |
| Font Size | `<Input type="number">` | 8-200px | `fontSize` |
| Font Family | `<DropdownMenu>` | 6 font families | `fontFamily` |
| Alignment | Button group | left/center/right | `textAlign` |
| Weight | Button group | normal/bold | `fontWeight` |
| Color | `<input type="color">` | Hex color picker | `color` |

**Available Fonts:**

**Action Flow:**

1. User configures text properties
2. Live preview updates with `style` prop reflecting all settings
3. `handleAddText()` called on button click
4. `onAddText()` callback invoked with all parameters
5. Navigation to `../media-bin` route via `useNavigate()`

**Sources:** app/components/media/TextEditor.tsx17-26 app/components/media/TextEditor.tsx39-46 app/components/media/TextEditor.tsx48-53 app/components/media/TextEditor.tsx188-202

## Landing Page Components

The landing page (`landing.tsx`) creates a marketing interface with a mock video editor demonstration.

### Landing Page Structure

```
landing.tsx

Hero Section

Mock Video Editor Interface

Waitlist Form Section

handleLogoClick()

GitHub API Integration

GIF Mask Text Effect

Mock Top Menu Bar

Mock Media Bin Sidebar

Mock Preview Window

Mock Inspector Panel

Mock Tools Panel

Mock Timeline

Content Rotation System

timelineAssets Array

Animated Playhead

Supabase REST API

getWaitlistCount()

handleSubmit()
```

**Sources:** app/routes/landing.tsx104-509 app/routes/landing.tsx510-828

### Mock Editor Interface

The landing page renders a non-functional but visually accurate editor interface:

**Components:**

| Section | Implementation | Lines |
| --- | --- | --- |
| Top Menu Bar | Static buttons for File/Edit/View/Project | 522-534 |
| Left Media Bin | Mock file list with Video/Music/Image/Type icons | 554-590 |
| Preview Window | `<AnimatePresence>` with rotating content slides | 610-681 |
| Tools Panel | Static button grid with editor tool icons | 730-763 |
| Timeline | Animated asset blocks with playhead | 767-828 |

**Content Rotation System:**

The preview window cycles through 6 feature slides using a `timelineAssets` array:

```
const timelineAssets = [

{

label: "Intro",

start: 0,

duration: 30,

heading: "Think 'vibe coding,' but for video editing",

badges: ["AI-Powered", "Instant Preview", "Creator DNA"],

animation: { initial: {...}, animate: {...}, exit: {...} }

},

// ... 5 more slides

];
```

Playhead advances every 120ms, with content transitioning based on `currentTime` within each asset's `start` and `duration` range.

**Sources:** app/routes/landing.tsx146-276 app/routes/landing.tsx285-302 app/routes/landing.tsx613-680

### Interactive Features

**Logo Click Audio:**

The `handleLogoClick()` function generates a three-tone ascending audio sequence using Web Audio API:

```
const createTone = (freq: number, startTime: number, duration: number) => {

const oscillator = audioContext.createOscillator();

const gainNode = audioContext.createGain();

oscillator.frequency.setValueAtTime(freq, startTime);

oscillator.type = "sine";

gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

};

createTone(659.25, now, 0.4); // E5

createTone(783.99, now + 0.1, 0.3); // G5

createTone(987.77, now + 0.2, 0.2); // B5
```

**Waitlist Integration:**

The form submits to Supabase with IP address tracking:

```
async function handleSubmit(e: React.FormEvent) {

const ip = await getIp(); // Fetches from api.ipify.org

const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {

method: "POST",

headers: {

"Content-Type": "application/json",

apikey: SUPABASE_ANON_KEY,

Authorization: `Bearer ${SUPABASE_ANON_KEY}`

},

body: JSON.stringify({ email, ip_address: ip })

});

}
```

**Sources:** app/routes/landing.tsx334-372 app/routes/landing.tsx304-332 app/routes/landing.tsx58-91

### Roadmap Timeline

The `roadmap.tsx` implements an interactive timeline visualization:

| Component | Purpose |
| --- | --- |
| `TimelineTrack` | Renders feature tracks with playable timelines |
| `TimelineItem` | Individual feature blocks with progress indicators |
| Tooltip System | Hover details for each feature |
| Progress Calculation | Real-time progress computation |

Each track includes play/pause controls and animated playheads that demonstrate development progress across quarters.

**Sources:** app/routes/roadmap.tsx102-232 app/routes/roadmap.tsx33-97

## Component Communication Patterns

### Outlet Context Pattern

Many components use React Router's `useOutletContext` to receive props from parent routes:

```
// In LeftPanel.tsx

<Outlet context={{

mediaBinItems,

isMediaLoading,

onAddMedia,

onAddText,

contextMenu,

handleContextMenu,

// ... other props

}} />

// In child components

const { onAddText } = useOutletContext<TextEditorProps>();
```

**Sources:** app/components/editor/LeftPanel.tsx91-104 app/components/media/TextEditor.tsx29

### Event Handler Delegation

Components use prop drilling for event handlers, with parent components managing state and child components triggering actions:

```
interface LeftPanelProps {

handleContextMenu: (e: React.MouseEvent, item: MediaBinItem) => void;

handleDeleteFromContext: () => void;

handleSplitAudioFromContext: () => void;

handleCloseContextMenu: () => void;

}
```

**Sources:** app/components/editor/LeftPanel.tsx24-27

This architecture provides clear separation between UI presentation logic and business logic, enabling reusable components that can be easily tested and maintained.

### Timeline Data Structures

The AI operates on these domain models (also defined in `schema.py`):

| Model | Purpose | Key Fields |
| --- | --- | --- |
| `TextProperties` | Text styling | `textContent`, `fontSize`, `fontFamily`, `color` |
| `BaseScrubber` | Base media element | `id`, `mediaType`, `mediaUrlLocal`, `media_width` |
| `MediaBinItem` | Media library entry | Extends `BaseScrubber` + `name`, `durationInSeconds` |
| `ScrubberState` | Timeline element | Extends `MediaBinItem` + `left`, `y`, `width` (timeline positions) |
| `TrackState` | Timeline track | `id`, `scrubbers: list[ScrubberState]` |
| `TimelineState` | Complete timeline | `tracks: list[TrackState]` |

## Response Parsing and Error Handling

### Multi-Strategy Parsing

The service implements robust parsing to handle different Gemini SDK versions backend/main.py335-393:

**Key parsing attempts**:

1. **`response.parsed`**: Gemini SDK may provide pre-parsed structured output backend/main.py335-368
2. **`response.text`**: Fallback to JSON string parsing backend/main.py371-383
3. **`response.to_dict()`**: Last resort serialization backend/main.py386-393

### Debug Logging

The service includes defensive logging backend/main.py213-225 backend/main.py322-332:

```
print("[AI] Incoming payload summary:", {

"message": request.message[:200],

"mentioned_scrubber_ids": request.mentioned_scrubber_ids,

"timeline_state_present": request.timeline_state is not None,

"mediabin_count": len(request.mediabin_items or []),

})
```

This helps diagnose issues without exposing full payloads.

## Data Types and Repository Layer

### AssetRecord Interface

The `AssetRecord` type defines the asset database schema:

```
type AssetRecord = {

id: string;

user_id: string;

project_id: string | null;

original_name: string;

storage_key: string;

mime_type: string;

size_bytes: number;

width: number | null;

height: number | null;

duration_seconds: number | null;

created_at: string;

deleted_at: string | null;

}
```

### ProjectRecord Interface

The `ProjectRecord` type defines the project database schema:

```
type ProjectRecord = {

id: string;

user_id: string;

name: string;

created_at: string;

updated_at: string;

}
```

Sources: app/lib/assets.repo.ts4-17 app/lib/projects.repo.ts29-35

## Data Types and Interfaces

This document provides a comprehensive reference for the TypeScript interfaces, data structures, and type definitions that form the backbone of the video editor's data model. These types define how media assets, timeline data, and rendering information flow through the application, from initial media import through final video export.

For information about the React component architecture that uses these types, see [Component Architecture](#4.3). For details about the API endpoints that consume and return these data structures, see [API Reference](#4.2).

## Core Media Types

The application's type system is built around a hierarchy of media representations, starting with the fundamental `BaseScrubber` interface that defines the essential properties shared by all media elements.

### BaseScrubber Interface

The `BaseScrubber` interface app/components/timeline/types.ts2-15 serves as the foundation for all media elements in the system, whether they exist in the media bin or positioned on the timeline. It encapsulates the core properties that every media item must have:

| Property | Type | Purpose |
| --- | --- | --- |
| `id` | `string` | Unique identifier for the media element |
| `mediaType` | `"video" | "image" | "audio" | "text"` | Categorizes the type of media content |
| `mediaUrlLocal` | `string | null` | Local file path reference (null for text) |
| `mediaUrlRemote` | `string | null` | Remote URL reference for uploaded media |
| `media_width` | `number` | Original media width in pixels |
| `media_height` | `number` | Original media height in pixels |
| `text` | `TextProperties | null` | Text styling properties for text media |
| `left_transition_id` | `string | null` | Transition effect entering this media |
| `right_transition_id` | `string | null` | Transition effect exiting this media |

### MediaBinItem Interface

The `MediaBinItem` interface app/components/timeline/types.ts37-44 extends `BaseScrubber` with properties specific to media assets stored in the media bin before they are placed on the timeline:

```
interface MediaBinItem extends BaseScrubber {

name: string;

durationInSeconds: number;

uploadProgress: number | null;

isUploading: boolean;

}
```

This interface tracks upload state and provides human-readable names for media assets, serving as the intermediate representation between raw file uploads and timeline-positioned media.

**Sources:** app/components/timeline/types.ts1-44

## Timeline Data Structures

The timeline system uses a hierarchical data model that organizes media elements into tracks and manages their positioning and relationships.

### ScrubberState Interface

The `ScrubberState` interface app/components/timeline/types.ts47-63 represents media elements positioned within the timeline, extending `MediaBinItem` with spatial and temporal positioning data:

| Property Category | Properties | Purpose |
| --- | --- | --- |
| Timeline Position | `left`, `y`, `width` | Pixel-based positioning in timeline view |
| Player Position | `left_player`, `top_player`, `width_player`, `height_player` | Position in video preview player |
| Interaction State | `is_dragging` | Tracks user drag operations |
| Media Relationships | `sourceMediaBinId` | Links back to original media bin item |
| Trimming | `trimBefore`, `trimAfter` | Frame-based trim points for video/audio |

### TrackState and TimelineState

The `TrackState` interface app/components/timeline/types.ts66-70 organizes scrubbers into horizontal tracks, while `TimelineState` app/components/timeline/types.ts73-75 represents the complete timeline as a collection of tracks:

```
TimelineState

TrackState[]

ScrubberState[]

Transition[]

BaseScrubber properties

MediaBinItem properties

Timeline positioning

Player properties
```

**Sources:** app/components/timeline/types.ts47-75

### TimelineDataItem Interface

The `TimelineDataItem` interface app/components/timeline/types.ts78-96 represents the final, render-ready transformation of timeline data. This type is generated by the `getTimelineData()` function and consumed by the Remotion rendering system.

The interface flattens the hierarchical track structure into a linear array of scrubbers with calculated timing properties:

| Property | Type | Purpose |
| --- | --- | --- |
| `scrubbers` | Extended `BaseScrubber[]` | Flattened media elements with timing |
| `transitions` | `{ [id: string]: Transition }` | Transition effects lookup table |

Each scrubber in the `TimelineDataItem` includes additional computed properties:

* `startTime`, `endTime`, `duration`: Temporal positioning in the video
* `trackIndex`: Vertical position for layering
* Player positioning properties for preview rendering
* Trimming information for video/audio clipping

**Sources:** app/components/timeline/types.ts78-96

## Supporting Types

### Transition Interface

The `Transition` interface app/components/timeline/types.ts17-25 defines visual effects that occur between media elements:

```
interface Transition {

id: string;

presentation: "fade" | "wipe" | "clockWipe" | "slide" | "flip" | "iris";

timing: "spring" | "linear";

durationInFrames: number;

leftScrubberId: string | null;

rightScrubberId: string | null;

}
```

### TextProperties Interface

The `TextProperties` interface app/components/timeline/types.ts27-34 specifies styling for text-based media elements:

| Property | Type | Options |
| --- | --- | --- |
| `textContent` | `string` | The actual text content |
| `fontSize` | `number` | Text size in pixels |
| `fontFamily` | `string` | Font family name |
| `color` | `string` | CSS color value |
| `textAlign` | `string` | `"left"`, `"center"`, `"right"` |
| `fontWeight` | `string` | `"normal"`, `"bold"` |

**Sources:** app/components/timeline/types.ts17-34

## Constants and Configuration

The types file defines several constants that control timeline behavior and rendering parameters:

```
// Timeline display constants

PIXELS_PER_SECOND = 100;

DEFAULT_TRACK_HEIGHT = 60;

RULER_HEIGHT = 32;

// Video rendering constants

FPS = 30;

// Zoom control constants

MIN_ZOOM = 0.25;

MAX_ZOOM = 4;

DEFAULT_ZOOM = 1;
```

These constants are used throughout the application to maintain consistent spacing, sizing, and timing calculations.

## Type Transformation Flow

The following diagram illustrates how data types transform as media moves through the application pipeline:

```
File Upload

MediaBinItem  
• name  
• durationInSeconds  
• uploadProgress

ScrubberState  
• Timeline position  
• Player properties  
• Drag state

TrackState  
• scrubbers[]  
• transitions[]

TimelineState  
• tracks[]

TimelineDataItem  
• Flattened scrubbers  
• Calculated timing  
• Render-ready

Remotion  
Video Rendering
```

