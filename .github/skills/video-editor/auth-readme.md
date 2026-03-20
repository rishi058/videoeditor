## Authentication Architecture

```
Visit site

signInWithGoogle()

OAuth callback

CREATE session

Set-Cookie

Subsequent requests

Verify session

User

Login Page

Google OAuth

Better Auth Library  
auth.server.ts

sessions table  
PostgreSQL

HTTP-only Cookie  
trykimu.com domain
```

**Session Management**: Better Auth 1.4.15 handles session creation, verification, and cookie management. Sessions are stored in PostgreSQL with HTTP-only cookies scoped to the production domain. The `useAuth` hook manages client-side authentication state with dual-source reconciliation for fault tolerance.

Kimu uses **Better Auth** as the authentication framework with **Google OAuth 2.0** as the identity provider. The system follows a session-based approach where authentication state is stored server-side in PostgreSQL and referenced client-side via HTTP-only cookies.

### System Components

| Component | Location | Role |
| --- | --- | --- |
| Better Auth Server | `app/lib/auth.server.ts` | Server-side auth API, session validation |
| Better Auth Client | `app/lib/auth.client.ts` | Client-side auth operations |
| `useAuth` Hook | `app/hooks/useAuth.ts` | React hook for auth state management |
| Login Route | `app/routes/login.tsx` | OAuth entry point |
| Route Loaders | Various `app/routes/*.tsx` | Server-side session checks |
| Sessions Table | PostgreSQL | Persistent session storage |

**Authentication System Architecture**

```
Infrastructure

Server Layer

Client Layer

fetch /api/auth/session

signIn.social()

OAuth redirect

callback

read/write

Set-Cookie

TLS termination

HSTS header

Browser  
(React App)

useAuth Hook  
app/hooks/useAuth.ts

authClient  
app/lib/auth.client.ts

Login Route  
app/routes/login.tsx

Route Loaders  
(session checks)

auth.server.ts  
Better Auth API

Nginx Proxy  
HTTPS + HSTS

PostgreSQL  
sessions table

Google OAuth  
Identity Provider
```

Sources: app/hooks/useAuth.ts1-282 app/routes/login.tsx1-169 docker-compose.yml23-35 nginx.conf27-36

### Session Management

Authentication uses **Better Auth** with:

* HTTP-only cookies scoped to `trykimu.com` domain
* Session tokens stored in PostgreSQL `session` table
* Google OAuth for identity provider
* Server-side session validation on each request

**Configuration Variables:**

* `AUTH_BASE_URL`: Canonical URL for OAuth callbacks
* `AUTH_TRUSTED_ORIGINS`: Allowed CORS origins
* `AUTH_COOKIE_DOMAIN`: Cookie scope domain

**Sources:** docker-compose.yml27-29 docker-compose.yml46-48

### useAuth Hook Architecture

The `useAuth` hook implements a **dual-source session reconciliation** pattern for reliability:

```
re-fetch

re-fetch

retry 5x

useAuth Hook

fetchRestSession()  
/api/auth/session

fetchClientSession()  
authClient.getSession()

reconcileAndSet()  
Prefer non-null user

user: AuthUser | null

window 'focus' listener

document 'visibilitychange' listener

OAuth callback detection  
(code/state params)

signInWithGoogle()  
authClient.signIn.social()

signOut()  
authClient.signOut()
```

**Session Reconciliation Logic:**

The hook fetches session data from two sources in parallel at app/hooks/useAuth.ts114-117:

1. REST API endpoint (`/api/auth/session`)
2. Better Auth client library (`authClient.getSession()`)

If either source returns a user, that user is set. Only if both sources return `null` is the user state cleared. This provides fault tolerance if one source temporarily fails.

**OAuth Callback Handling:**

When OAuth params (`code`, `state`, `error`) are detected in the URL at app/hooks/useAuth.ts122-127 the hook initiates a retry loop with 5 attempts spaced 800ms apart. After processing, the URL is cleaned by removing OAuth params at app/hooks/useAuth.ts141-151

**Sources:** app/hooks/useAuth.ts54-195 app/hooks/useAuth.ts114-156

## Component Organization

### Component Directory Structure

Components are organized by domain and reusability:

```
app/
├── components/
│   ├── ui/               # Reusable UI primitives (shadcn/ui based)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── resizable.tsx
│   │   ├── ProfileMenu.tsx
│   │   ├── Navbar.tsx
│   │   └── ...
│   ├── editor/           # Editor-specific components
│   │   └── LeftPanel.tsx
│   ├── timeline/         # Timeline subsystem components
│   │   ├── TimelineTracks.tsx
│   │   ├── TimelineRuler.tsx
│   │   ├── RenderStatus.tsx
│   │   ├── MediaBin.tsx
│   │   └── types.ts      # Timeline-related TypeScript types
│   ├── media/            # Media-related components
│   │   ├── TextEditor.tsx
│   │   └── Transitions.tsx
│   └── chat/             # AI assistant interface
│       └── ChatBox.tsx
├── hooks/                # Custom React hooks
│   ├── useTimeline.ts
│   ├── useMediaBin.ts
│   ├── useRuler.ts
│   ├── useRenderer.ts
│   └── useAuth.ts
├── video-compositions/   # Remotion video components
│   ├── VideoPlayer.tsx
│   └── TimelineComposition.tsx
├── routes/               # Route handlers
│   ├── home.tsx         # Main editor (TimelineEditor)
│   ├── landing.tsx
│   ├── projects.tsx
│   └── ...
└── lib/                  # Library configurations
    ├── auth.client.ts   # Better Auth client
    └── auth.server.ts   # Better Auth server
```

**Component Categories:**

| Category | Purpose | Examples |
| --- | --- | --- |
| `components/ui/` | Generic, reusable UI primitives | Button, Input, Switch, Resizable panels |
| `components/editor/` | Editor shell components | LeftPanel (sidebar container) |
| `components/timeline/` | Timeline-specific UI | TimelineTracks, TimelineRuler, MediaBin |
| `components/media/` | Media editing tools | TextEditor, Transitions |
| `components/chat/` | AI assistant interface | ChatBox |
| `video-compositions/` | Remotion video rendering | VideoPlayer, TimelineComposition |
| `hooks/` | State management and logic | useTimeline, useMediaBin, useAuth |

**Sources:** File structure visible across provided files

### Component Communication Pattern

Components communicate through a **props-drilling pattern** from the main `TimelineEditor` component, which acts as the orchestration layer:

```
state + handlers

mediaBinItems, handlers

timelineData, playerRef

timeline, handlers

rulerPositionPx, handlers

messages, context

renders

renders

renders

TimelineEditor  
app/routes/home.tsx  
(Orchestration Layer)

Custom Hooks  
useTimeline, useMediaBin, etc.

LeftPanel  
Media management

VideoPlayer  
Remotion preview

TimelineTracks  
Track container

TimelineRuler  
Time navigation

ChatBox  
AI assistant

MediaBin  
Asset display

TextEditor  
Text creation

Transitions  
Effect library
```

**Key Communication Patterns:**

1. **Handler Functions:** The `TimelineEditor` destructures handler functions from hooks and passes them down to child components at app/routes/home.tsx115-149
2. **Ref Sharing:** The `playerRef` (Remotion Player) is shared between `VideoPlayer`, ruler synchronization, and playback controls
3. **Context-Free:** No React Context is used; all state flows through props
4. **Callback Lifting:** Child components call parent-provided handlers to modify state (e.g., `handleUpdateScrubber`, `handleAddMediaToBin`)

**Sources:** app/routes/home.tsx73-182 app/routes/home.tsx876-896

## Service Communication

### API Base URL Configuration

The frontend communicates with multiple backend services through a centralized API configuration utility:

```
NODE_ENV=development

NODE_ENV=development  
fastapi=false

NODE_ENV=development  
fastapi=true

NODE_ENV=production

NODE_ENV=production  
fastapi=false

NODE_ENV=production  
fastapi=true

getApiBaseUrl(fastapi, betterauth)  
app/utils/api.ts

Development:  
http://localhost:5173

http://localhost:8000

http://127.0.0.1:3000

Production:  
https://trykimu.com

https://trykimu.com/render

https://trykimu.com/ai/api
```

**Service Routing Logic:**

The `getApiBaseUrl()` function at app/utils/api.ts11-27 returns different base URLs based on:

* `betterauth` flag: Returns frontend URL for Better Auth endpoints (requires same-origin)
* `fastapi` flag: Routes to FastAPI AI service
* Neither flag: Routes to Node.js backend (video rendering service)

**Production URL Structure:**

| Service | URL | Nginx Proxy Path |
| --- | --- | --- |
| Frontend | `https://trykimu.com/` | Default route |
| Backend (Remotion) | `https://trykimu.com/render/*` | `/render/*` |
| FastAPI (AI) | `https://trykimu.com/ai/api/*` | `/ai/api/*` |
| Better Auth | `https://trykimu.com/api/auth/*` | Handled by frontend |

**Sources:** app/utils/api.ts1-35

### Authentication Cookie Security

Session cookies are configured with strict scoping in production:

```
AUTH_COOKIE_DOMAIN: trykimu.com
```

**Source:** docker-compose.yml29

This prevents cookies from being sent to unauthorized domains while allowing access from both `trykimu.com` and `www.trykimu.com` (covered by `AUTH_TRUSTED_ORIGINS`).

### HTTPS and TLS

Nginx terminates TLS and redirects all HTTP traffic to HTTPS:

nginx.conf20-25

```
# Redirect HTTP → HTTPS

server {

listen 80;

server_name trykimu.com www.trykimu.com;

return 301 https://$host$request_uri;

}
```

TLS certificates from Let's Encrypt are mounted read-only:

nginx.conf32-33

```
ssl_certificate /etc/letsencrypt/live/trykimu.com/fullchain.pem;

ssl_certificate_key /etc/letsencrypt/live/trykimu.com/privkey.pem;
```

docker-compose.yml10

### HTTP Strict Transport Security (HSTS)

HSTS header forces browsers to use HTTPS for all future requests:

nginx.conf36

| Directive | Value | Meaning |
| --- | --- | --- |
| `max-age` | 63072000 | 2 years in seconds |
| `includeSubDomains` | - | Apply to all subdomains |
| `preload` | - | Eligible for browser preload list |

### Protected Media Access

Nginx blocks direct access to media files, requiring authentication through the API:

nginx.conf77-80

```
# Block direct access to /media/* - all asset access must go through authenticated API

location /media {

return 403;

}
```

All asset access must go through `/api/assets/*` endpoints nginx.conf64-75 which enforce session validation before serving files.

**Security Layer Architecture**

```
Services

Path-Based Protection

Security Headers

Validate session

Internet

Nginx Proxy  
:443 HTTPS

HSTS Header  
max-age=63072000

TLS 1.2+  
Let's Encrypt

Block /media/*  
return 403

Allow /api/assets/*  
with session check

Frontend  
Session validation

Backend  
Render service

FastAPI  
AI service

auth.api.getSession()
```

Sources: nginx.conf20-36 nginx.conf77-80 nginx.conf64-75 docker-compose.yml10

## Storage and Persistence

### Media Storage Volume

The `./out` directory is the primary persistent storage location:

#### Directory Structure

```
./out/
├── uploads/          # User-uploaded media
│   ├── video/
│   ├── audio/
│   └── image/
└── renders/          # Rendered video outputs
    └── [project-id]-[timestamp].mp4
```

**Volume characteristics:**

* **Persistence:** Survives container restarts and rebuilds
* **Shared access:** Backend has read/write access
* **Backup strategy:** Host-level backup of `./out` directory recommended

### TLS Certificate Volume

Let's Encrypt certificates are mounted read-only from the host:

**Source:** docker-compose.yml10

The `:ro` flag prevents the Nginx container from modifying certificates, enforcing the principle that certificate management occurs at the host level (e.g., via `certbot` renewal cron jobs).

## Authentication UI

The login interface uses a specialized animated design with glassmorphism effects and particle animations.

### Login Component Structure

```
login.tsx

Animated Background

Center Orb Container

Floating UI Elements

Timeline Grid Pattern

Multi-hue Radial Glows

Sweeping Playhead

Outer Halo Effects

Soft Inner Glow

Rotating Multi-hue Sheen

Concentric Ring Lines

Specular Highlight

KimuLogo Center

Clapperboard

Wand2

Scissors

Google OAuth Button

useAuth Hook
```

The login page includes sophisticated CSS animations with keyframes for sweeping, floating, pulsing, and spinning effects.

**Sources:** app/routes/login.tsx29-167 app/routes/login.tsx74-103 app/routes/login.tsx160-164

## Specialized Components

### 404 Error Page

The `NotFound` component creates an immersive video editor-themed 404 experience:

```
NotFound.tsx

Video Editor Background

Discord-style Chat

Floating Editor Icons

Animated Top Menu Bar

Left Media Panel

Right Preview Panel

Bottom Timeline

Tools Panel

Kimu Avatar with Logo

Timed Message Sequence

Animated Typing Dots

Start Creating Button

Floating Video Icons

Floating Music Icons

Floating Scissors Icons

Floating Sparkles Icons

Initial Greeting

Typing Animation

Feature Description

CTA Display
```

The component uses a timed animation sequence with `useState` and `useEffect` to create a conversational flow that introduces users to Kimu's capabilities.

**Sources:** app/NotFound.tsx33-57 app/NotFound.tsx66-303 app/NotFound.tsx430-624

# Google OAuth (Required for authentication)

GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com

GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Authentication URLs (Development)

AUTH_BASE_URL=http://localhost:5173

AUTH_TRUSTED_ORIGINS=http://localhost:5173,http://localhost:8000

AUTH_COOKIE_DOMAIN=localhost
```

### Optional Variables

```
### Obtaining OAuth Credentials

1. Visit [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Navigate to **APIs & Services** > **Credentials**
4. Create **OAuth 2.0 Client ID** (Application type: Web application)
5. Add authorized redirect URIs:
   * `http://localhost:5173/api/auth/callback/google` (development)
   * Your production domain callback URL if deploying
6. Copy `Client ID` and `Client Secret` to `.env`

The authentication system uses **Better Auth** (package.json43) with Google as the OAuth provider. Session management is configured via `AUTH_BASE_URL`, `AUTH_TRUSTED_ORIGINS`, and `AUTH_COOKIE_DOMAIN`.

**Sources:** README.md131-160 docker-compose.yml19-32 Dockerfile.frontend13-19

## Authentication and Security

This document describes the authentication and authorization mechanisms used in Kimu Video Editor, including the Better Auth library integration, Google OAuth flow, session management, and security configurations. The system implements session-based authentication with HTTP-only cookies, Google as the sole identity provider, and multi-service coordination across frontend, backend, and AI services.

For API endpoint protection and request validation, see [API Reference](./backend-readme.md).

## Better Auth Integration

Better Auth is a TypeScript authentication library that provides OAuth integration, session management, and security utilities. Kimu uses Better Auth in both client and server contexts.

### Server-Side Auth (`auth.server.ts`)

The `auth` object exported from `app/lib/auth.server.ts` exposes the Better Auth API for server-side operations:

* **`auth.api.getSession`** - Validates session from request headers
* Session creation and deletion
* OAuth callback handling

This object is imported in route loaders to check authentication status:

```
// app/routes/login.tsx:8-23

export async function loader({ request }: { request: Request }) {

const session = await auth.api?.getSession?.({ headers: request.headers });

const uid: string | undefined = session?.user?.id || session?.session?.userId;

if (uid) return new Response(null, { status: 302, headers: { Location: "/projects" } });

return null;

}
```

### Client-Side Auth (`auth.client.ts`)

The `authClient` object from `app/lib/auth.client.ts` provides client-side authentication methods:

* **`authClient.signIn.social`** - Initiates OAuth flow
* **`authClient.signOut`** - Terminates session
* **`authClient.getSession`** - Retrieves current session

Sources: app/routes/login.tsx2-23 app/hooks/useAuth.ts97-102 app/hooks/useAuth.ts202-214

## Google OAuth Flow

Kimu uses Google as the sole OAuth provider. The authentication flow redirects users through Google's authorization servers and returns them to the application with a session cookie.

**OAuth 2.0 Flow with Code Entities**

```
Browser"PostgreSQLsessions table""auth.server.tsBetter Auth API""Google OAuth""authClientsignIn.social()""useAuth HooksignInWithGoogle()""Login Pageapp/routes/login.tsx"UserBrowser"PostgreSQLsessions table""auth.server.tsBetter Auth API""Google OAuth""authClientsignIn.social()""useAuth HooksignInWithGoogle()""Login Pageapp/routes/login.tsx"UserOAuth params cleanupClick "Continue with Google"signInWithGoogle()signIn.social({provider: "google"})Redirect to OAuth consentShow consent screenApproveGET /api/auth/callback/google?code=...Exchange code for user infoReturn user profileINSERT INTO sessionsSession createdSet-Cookie: better-auth-sessionRedirect to /projectsRemove ?code, ?state from URL
```

### OAuth Parameter Handling

The `useAuth` hook detects OAuth callback parameters and performs retry logic to ensure session establishment:

app/hooks/useAuth.ts121-156

Key behaviors:

* Detects `code`, `state`, or `error` query parameters
* Performs up to 5 retry attempts with 800ms intervals
* Cleans URL by removing OAuth params after 5 seconds
* Only modifies URL if origin matches (security check)

**OAuth Entry Point (Login Page)**

```
// app/routes/login.tsx:25-27

const { isSigningIn, signInWithGoogle } = useAuth();

// app/routes/login.tsx:111-143

<button onClick={signInWithGoogle} disabled={!!isSigningIn}>

{isSigningIn ? "Signing in..." : <><FaGoogle />Continue with Google</>}

</button>
```

Sources: app/hooks/useAuth.ts121-156 app/routes/login.tsx25-143 app/hooks/useAuth.ts197-242

## Session Management

Sessions are stored in PostgreSQL and referenced via HTTP-only cookies. The session lifecycle is managed by Better Auth with coordination across multiple services.

### Cookie Configuration

Session cookies are configured with specific domain and security properties:

| Property | Value | Purpose |
| --- | --- | --- |
| Domain | `trykimu.com` | Allows sharing across subdomains |
| Path | `/` | Cookie sent with all requests |
| HttpOnly | `true` | Prevents JavaScript access |
| Secure | `true` | HTTPS-only transmission |
| SameSite | `Lax` | CSRF protection |

**Environment Variables**

All services must use consistent authentication configuration:

docker-compose.yml27-29

```
AUTH_BASE_URL: https://trykimu.com

AUTH_TRUSTED_ORIGINS: https://trykimu.com,https://www.trykimu.com

AUTH_COOKIE_DOMAIN: trykimu.com
```

These variables are set identically for frontend docker-compose.yml27-29 and backend docker-compose.yml46-48 services to ensure OAuth callbacks and cookie validation work correctly.

### Session Validation

Session validation occurs in two places:

1. **Server-side** - Route loaders call `auth.api.getSession`
2. **Client-side** - `useAuth` hook polls REST endpoint and Better Auth client

Sources: docker-compose.yml27-35 docker-compose.yml46-48 app/hooks/useAuth.ts68-93

### Dual-Source Session Checking

The `useAuth` hook implements a **dual-source reconciliation pattern** that queries both the REST API and Better Auth client for session state. This provides fault tolerance if either source fails.

```
AuthUser | null | undefined

AuthUser | null | undefined

a is user

b is user

both null

both undefined

initialCheck()

fetchRestSession()  
GET /api/auth/session

fetchClientSession()  
authClient.getSession()

reconcileAndSet(a, b)

Reconciliation Logic

setUser(a)

setUser(b)

setUser(null)

Preserve existing user
```

**Sources:** app/hooks/useAuth.ts68-118

### Reconciliation Logic

The reconciliation function at app/hooks/useAuth.ts104-111 implements the following priority:

| Source A (REST) | Source B (Client) | Result | Rationale |
| --- | --- | --- | --- |
| `AuthUser` | any | Use A | REST API has valid session |
| `null` or `undefined` | `AuthUser` | Use B | Client has valid session |
| `null` | `null` | `null` | Both confirm no session |
| `undefined` | `undefined` | Preserve existing | Both failed, don't clear state |

### Session Endpoint Behavior

The `/api/auth/session` endpoint at app/routes/api.auth.$.tsx11-16 normalizes Better Auth's 404 response:

| Scenario | Better Auth Response | API Response | Client Interpretation |
| --- | --- | --- | --- |
| Valid session | 200 with user data | 200 with user data | `AuthUser` object |
| No session | 404 | 200 with `{ user: null }` | `null` (logged out) |
| Network error | N/A | catch → `undefined` | Preserve existing state |

This normalization simplifies client-side logic by converting the "not found" case into a success response with `null` user.

**Sources:** app/hooks/useAuth.ts68-111 app/routes/api.auth.$.tsx11-16

### OAuth Callback Retry Mechanism

When OAuth parameters are detected in the URL (`code`, `state`, `error`), the hook initiates a retry loop to handle session creation race conditions:

```
URL has OAuth params

hasOAuthParams = true

Wait 400ms

Wait 800ms

Wait 800ms

Wait 800ms

Wait 800ms

Wait 5000ms total

Remove code/state/error params

DetectOAuthParams

StartRetry

Attempt1

Attempt2

Attempt3

Attempt4

Attempt5

CleanURL
```

Each attempt calls both `fetchRestSession()` and `fetchClientSession()` to check if the session has been created. The 5-second delay before URL cleanup ensures the session is established before removing OAuth parameters from the browser history.

**Sources:** app/hooks/useAuth.ts120-156

### Session Refresh Triggers

The hook subscribes to multiple events to refresh session state:

| Event | Trigger | Implementation |
| --- | --- | --- |
| Window focus | `focus` event | app/hooks/useAuth.ts159-163 |
| Page visibility | `visibilitychange` event | app/hooks/useAuth.ts165-171 |
| Better Auth state change | `onAuthStateChange()` callback | app/hooks/useAuth.ts178-186 |

These listeners ensure the session state remains synchronized when users switch tabs or when authentication state changes occur.

**Sources:** app/hooks/useAuth.ts159-194

## Client-Side Authentication State

The `useAuth` hook manages authentication state on the client with a dual-source reconciliation strategy for fault tolerance.

### useAuth Hook API

```
interface UseAuthResult {

user: AuthUser | null;          // Current authenticated user

isLoading: boolean;              // Initial session check in progress

isSigningIn: boolean;            // OAuth flow in progress

signInWithGoogle: () => Promise<void>;

signOut: () => Promise<void>;

}
```

### Dual-Source Reconciliation

The hook fetches session data from two sources simultaneously and reconciles the results:

**Session Reconciliation Strategy**

```
Result

Reconciliation Logic

Fetch Sources

AuthUser | null | undefined

AuthUser | null | undefined

Yes

No

useAuth Hook  
app/hooks/useAuth.ts

fetchRestSession()  
fetch /api/auth/session

fetchClientSession()  
authClient.getSession()

reconcileAndSet(a, b)  
line 104-111

Both null?

setUser(null)

setUser(a || b)

undefined = error/no data  
null = no session  
AuthUser = valid session
```

**Reconciliation Rules** app/hooks/useAuth.ts104-111:

* Prefer any non-null user data from either source
* Only set `user` to `null` if **both** sources return `null`
* If one source errors (returns `undefined`), rely on the other
* Ignore updates if user ID hasn't changed (prevents re-renders)

### State Update Triggers

The `useAuth` hook updates authentication state on:

1. **Initial mount** - Checks both sources once
2. **OAuth callback** - Detects URL params, retries 5 times
3. **Window focus** - User returns to tab app/hooks/useAuth.ts159-163
4. **Page visibility** - Tab becomes visible app/hooks/useAuth.ts165-171
5. **Better Auth events** - `onAuthStateChange` subscription app/hooks/useAuth.ts178-186

### Session Fetching Functions

**REST API Session Fetch** app/hooks/useAuth.ts68-93:

```
const fetchRestSession = async (): Promise<AuthUser | null | undefined> => {

const sessionUrl = apiUrl("/api/auth/session", false, true);

const res = await fetch(sessionUrl, {

credentials: "include",

headers: { "Content-Type": "application/json" }

});

if (res.ok) return extractUser(await res.json());

if (res.status === 404) return null;

return undefined; // error case

};
```

**Better Auth Client Session Fetch** app/hooks/useAuth.ts95-102:

```
const fetchClientSession = async (): Promise<AuthUser | null | undefined> => {

const result = await authClient.getSession?.();

return extractUser(result);

};
```

Sources: app/hooks/useAuth.ts54-195 app/hooks/useAuth.ts104-111 app/hooks/useAuth.ts159-186

## Server-Side Session Validation

Route loaders perform server-side session checks before rendering protected pages. This prevents unauthorized access and enables server-side redirects.

### Loader Authentication Pattern

Routes that require authentication use this pattern:

```
// app/routes/login.tsx:8-23

export async function loader({ request }: { request: Request }) {

try {

const session = await auth.api?.getSession?.({ headers: request.headers });

const uid: string | undefined = session?.user?.id || session?.session?.userId;

if (uid) {

// Already authenticated -> redirect to projects

return new Response(null, { status: 302, headers: { Location: "/projects" } });

}

} catch {

console.error("Login failed");

}

return null; // Allow access to login page

}
```

### Protected Route Flow

**Server-Side Session Check**

```
Validate cookie

Session data

Yes (authenticated)

No (public page)

No (protected page)

Redirect to /login

HTTP Request  
with Cookie header

Route Loader  
loader({ request })

auth.api.getSession()  
app/lib/auth.server.ts

User ID  
present?

PostgreSQL  
sessions table

HTTP 302 Redirect  
to /projects

Render protected page

Render public page
```

### Session Extraction

The loader extracts user ID from the session response, which may have varying structure:

app/routes/login.tsx12-13

```
const uid: string | undefined = session?.user?.id || session?.session?.userId;
```

This handles different response shapes from Better Auth API.

Sources: app/routes/login.tsx8-23

## API URL Configuration

The `apiUrl` utility constructs service-specific URLs based on environment and service type. This enables proper routing for authentication endpoints across development and production.

### getApiBaseUrl Function

app/utils/api.ts11-27

```
export const getApiBaseUrl = (fastapi: boolean = false, betterauth: boolean = false): string => {

const nodeEnv = safeEnv("NODE_ENV", "development");

const isProduction = nodeEnv === "production";

const prodDomainHost = safeEnv("PROD_DOMAIN", "trykimu.com") as string;

const protocol = prodDomainHost.includes("localhost") ? "http" : "https";

const prodDomain = `${protocol}://${prodDomainHost}`;

if (betterauth) {

return isProduction ? prodDomain : "http://localhost:5173"; // frontend

} else if (fastapi) {

return isProduction ? `${prodDomain}/ai/api` : "http://127.0.0.1:3000";

} else {

return isProduction ? `${prodDomain}/render` : "http://localhost:8000";

}

};
```

### Authentication Endpoint URLs

| Environment | Endpoint | URL |
| --- | --- | --- |
| Development | `/api/auth/session` | `http://localhost:5173/api/auth/session` |
| Production | `/api/auth/session` | `https://trykimu.com/api/auth/session` |
| Development | OAuth callback | `http://localhost:5173/api/auth/callback/google` |
| Production | OAuth callback | `https://trykimu.com/api/auth/callback/google` |

**Usage in useAuth**:

app/hooks/useAuth.ts70

```
const sessionUrl = apiUrl("/api/auth/session", false, true); // betterauth=true
```

The third parameter `true` indicates this is a Better Auth endpoint, returning the frontend service URL.

Sources: app/utils/api.ts11-34 app/hooks/useAuth.ts70

## Sign-Out Flow

The sign-out process clears the session and redirects the user to the login page.

### Client-Side Sign-Out

app/hooks/useAuth.ts244-279

```
const signOut = async () => {

try {

console.log("🚪 Signing out...");

if (authClient.signOut) {

console.log("🔐 Using Better Auth client signOut");

const result = await authClient.signOut();

console.log("✅ Sign-out successful via client");

setUser(null);

} else {

console.log("❌ Sign out failed");

}

} catch (error) {

console.error("❌ Sign out error:", error);

}

};
```

The `authClient.signOut()` method:

1. Calls Better Auth API to invalidate session
2. Clears session from PostgreSQL
3. Removes session cookie
4. Client sets local `user` state to `null`

**Sign-Out Sequence**

```
Browser"PostgreSQLsessions""auth.server.ts""authClient.signOut()""useAuth.signOut()""UI Component"UserBrowser"PostgreSQLsessions""auth.server.ts""authClient.signOut()""useAuth.signOut()""UI Component"UserClick "Sign Out"signOut()signOut()POST /api/auth/sign-outDELETE FROM sessions WHERE id = ?Session deletedClear cookie (Max-Age=0){ success: true }ResolvesetUser(null)Redirect to /login
```

Sources: app/hooks/useAuth.ts244-279

### Authentication Flow Differences

| Aspect | Development | Production |
| --- | --- | --- |
| Protocol | HTTP | HTTPS |
| Base URL | `localhost:5173` | `trykimu.com` |
| Cookie Domain | `localhost` | `trykimu.com` |
| OAuth Redirect | `http://localhost:5173/api/auth/callback/google` | `https://trykimu.com/api/auth/callback/google` |
| Session API | `http://localhost:5173/api/auth/session` | `https://trykimu.com/api/auth/session` |
| TLS | Not required | Required (Let's Encrypt) |
| HSTS | Not set | Set with 2-year max-age |

## Authentication

All API endpoints require user authentication via session-based authentication using Better Auth. The `requireUserId` function validates user sessions through two mechanisms:

1. **Primary**: Better Auth runtime API session validation
2. **Fallback**: Cookie forwarding to `/api/auth/session` endpoint

```
Success

Failure

No Auth

API Request

requireUserId()

Better Auth API

Extract User ID

Cookie Fallback

/api/auth/session

Execute Endpoint

401 Unauthorized
```

**Authentication Flow Implementation**

Sources: app/routes/api.assets.$.tsx13-63 app/routes/api.projects.$.tsx23-52 app/routes/api.storage.$.tsx8-51

### Authentication Errors

All endpoints return `401 Unauthorized` when authentication fails:

```
{

"error": "Unauthorized"

}
```

### Common Error Responses

| Status | Error Type | Description |
| --- | --- | --- |
| 400 | Bad Request | Invalid request parameters or body |
| 401 | Unauthorized | Authentication required or failed |
| 404 | Not Found | Resource doesn't exist or user lacks access |
| 405 | Method Not Allowed | HTTP method not supported |
| 416 | Range Not Satisfiable | Invalid range request for asset streaming |
| 500 | Internal Server Error | Upload failed or server error |

### Path Traversal Protection

All file operations implement path traversal protection:

* `path.basename()` sanitization for storage keys
* `path.resolve()` validation against base directories
* Whitelist validation for project IDs in timeline storage

Sources: app/routes/api.assets.$.tsx121-127 app/lib/timeline.store.ts14-28

### Upload Errors

If an upload fails, the optimistic UI entry is removed from the media bin:

```
catch (error) {

console.error("Error adding media to bin:", error);

// Remove the failed item

setMediaBinItems((prev) => prev.filter((item) => item.id !== id));

throw new Error(`Failed to add media: ${errorMessage}`);

}
```

Sources: app/hooks/useMediaBin.ts308-316

### Server Connectivity

The upload implementation uses `axios` with `withCredentials: true` to include authentication cookies app/hooks/useMediaBin.ts277 Network errors result in the upload progress indicator remaining visible until the operation times out.

### File Size Limits

The backend enforces a 500MB file size limit via multer configuration app/videorender/videorender.ts54 Larger files are rejected before upload completes.

Sources: app/hooks/useMediaBin.ts308-316 app/videorender/videorender.ts51-65

## Authentication API

This document covers the authentication API endpoints and authentication flow within the Kimu video editor. The authentication system handles user login, session management, and OAuth integration using the Better Auth framework with Google OAuth provider.

For broader authentication and security concepts, see [Authentication and Security](./auth-readme.md). For frontend authentication components and user interface, see [User Interface Components](./frontend-readme.md).

## Authentication System Overview

The authentication system uses Better Auth with Google OAuth as the identity provider. All authentication requests are routed through a catch-all handler that forwards to Better Auth's internal API. The client implements a **dual-source session checking pattern** that queries both the REST API and the Better Auth client library for fault tolerance.

### useAuth Hook Interface

The `useAuth` hook exposes the following interface for authentication operations:

```
interface UseAuthResult {

user: AuthUser | null;           // Current authenticated user

isLoading: boolean;               // Initial session check in progress

isSigningIn: boolean;             // Sign-in operation in progress

signInWithGoogle: () => Promise<void>;  // Initiate Google OAuth

signOut: () => Promise<void>;     // Sign out and clear session

}
```

The hook returns normalized `AuthUser` objects with consistent shape regardless of source:

```
interface AuthUser {

id: string;                       // User ID

email?: string | null;            // User email

name?: string | null;             // Display name

image?: string | null;            // Avatar URL

}
```

The `normalizeAuthUser()` function at app/hooks/useAuth.ts62-65 handles the various response formats from Better Auth (which can nest user data in `data.user`, `session.user`, or direct `user` fields).

**Sources:** app/hooks/useAuth.ts7-52 app/hooks/useAuth.ts62-65

## Authentication Flow

### OAuth Sign-In Flow

The sign-in process uses Better Auth's `signIn.social()` method with Google as the provider. After OAuth callback, the system performs retry-based session checking to handle race conditions.

```
"PostgreSQL Sessions"Google"auth.handler""api.auth.$.tsx"authClientuseAuthUser"PostgreSQL Sessions"Google"auth.handler""api.auth.$.tsx"authClientuseAuthUserOAuth params detected in URLloop[Retry mechanism]signInWithGoogle()signIn.social({provider: "google"})POST /api/auth/sign-in/socialForward requestOAuth redirectConsent screenGrant permissionsGET /api/auth/callback/google?code=...Handle callbackINSERT session recordSet HTTP-only cookieRedirect to /projectscheckWithRetry() (5 attempts, 800ms delay)GET /api/auth/sessiongetSession()Validate sessionQuery sessionSession dataUser objectreconcileAndSet(restUser, clientUser)Clean URL params (5s delay)
```

**Sources:** app/hooks/useAuth.ts197-242 app/hooks/useAuth.ts120-156 app/routes/api.auth.$.tsx4-31

### Sign-Out Flow

Sign-out is handled via `authClient.signOut()`, which clears the session cookie and removes the database record.

```
"PostgreSQL Sessions""api.auth.$.tsx"authClientuseAuthUser"PostgreSQL Sessions""api.auth.$.tsx"authClientuseAuthUsersignOut()signOut()POST /api/auth/sign-outDELETE session recordClear HTTP-only cookieSuccesssetUser(null)
```

**Sources:** app/hooks/useAuth.ts244-279

## Development Guide

This document provides an overview of the development environment, tooling, and workflows for contributors working on the Kimu Video Editor codebase. It covers the repository structure, technology stack, development setup options, and key development tools.

For specific topics:

* Initial setup and running services locally: see [Getting Started](./deployment-readme.md)
* TypeScript interfaces and data structures: see [Data Types and Interfaces](./database-readme.md)
* State management patterns and custom hooks: see [State Management Architecture](./frontend-readme.md)
* Build, lint, and type checking workflows: see [Development Workflow](./deployment-readme.md)
* Backend service details: see [Backend Services](./backend-readme.md)
* Deployment and infrastructure: see [Infrastructure and Deployment](./deployment-readme.md)

## Repository Structure

```
Deployment

backend/ Directory

app/ Directory

Monorepo Root

package.json  
(Frontend scripts & deps)

tsconfig.json  
(TypeScript config)

.prettierrc  
(Code formatting)

eslint.config.js  
(Linting rules)

routes/  
(React Router pages)

lib/  
(Shared utilities)

hooks/  
(Custom React hooks)

components/  
(UI components)

videorender/  
(Backend Express server)

main.py  
(FastAPI application)

ai.py  
(Gemini integration)

pyproject.toml  
(Python deps)

docker-compose.yml  
(Production)

docker-compose.dev.yml  
(Development)

nginx/  
(Reverse proxy config)
```

**Key Directories:**

* **`app/`**: Frontend React application and Node.js backend rendering service
  + `app/routes/`: React Router route modules (landing page, login, editor, projects)
  + `app/hooks/`: Custom hooks (`useTimeline`, `useMediaBin`, `useRenderer`, `useAuth`)
  + `app/components/`: Reusable UI components (timeline, scrubbers, video player)
  + `app/lib/`: Shared utilities (database client, authentication server, type definitions)
  + `app/videorender/`: Express server for video rendering using Remotion
* **`backend/`**: Python FastAPI service for AI features
  + `backend/main.py`: FastAPI application with AI endpoints
  + `backend/ai.py`: Gemini API integration and tool calling logic
* **`nginx/`**: Reverse proxy configuration for production deployment

**Sources:** package.json1-15 README.md59-106

