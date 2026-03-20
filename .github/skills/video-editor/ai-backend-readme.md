### FastAPI Components

| Component | Purpose |
| --- | --- |
| `process_ai_message` | Main endpoint for AI chat processing |
| `_normalize_time_fields` | Parses natural language time expressions |
| `_second_pass_force_tool` | Retry mechanism for tool calling |
| Gemini tools catalog | Video editing function definitions |

### FastAPI Service (AI Features)

The FastAPI service provides AI-powered editing capabilities:

* Natural language command processing via Gemini 2.5 Flash
* Time expression normalization
* Video editing tool execution
* Function calling with structured outputs

* Framework: FastAPI (Python 3.13)
* Port: 3000 (internal)
* AI Model: `gemini-2.5-flash-latest`
* Path: backend/main.py

#### FastAPI Application Setup

```
app = FastAPI()

gemini_api = genai.Client(api_key=GEMINI_API_KEY)

app.add_middleware(

CORSMiddleware,

allow_origins=["*"],

allow_credentials=True,

allow_methods=["*"],

allow_headers=["*"],

)
```

The service initializes the Gemini client at startup and exposes a single primary endpoint: `POST /ai`.

**Sources:** backend/main.py21-31

### Time Normalization System

The AI service includes a sophisticated **natural language time parser** that extracts temporal information from user messages.

#### Time Parser: `_to_seconds()`

Converts various time formats to float seconds:

| Input Format | Example | Output |
| --- | --- | --- |
| Plain number | `"30"` | 30.0 |
| With unit | `"2m"`, `"90s"` | 120.0, 90.0 |
| Compound | `"1h 2m 3s"` | 3723.0 |
| Timestamp | `"1:30"`, `"0:01:30"` | 90.0, 90.0 |
| Decimal | `"2.5min"` | 150.0 |

**Implementation:** Uses bounded regex quantifiers (`{1,15}`, `{1,10}`) to prevent ReDoS attacks while matching units like `hours`, `mins`, `seconds`, `ms`.

**Sources:** backend/main.py46-99

#### Pattern Extraction: `_normalize_time_fields_from_text()`

Detects temporal patterns in natural language:

| Pattern | Regex | Extracted Fields |
| --- | --- | --- |
| Range | `from 2s to 12s` | `start_seconds=2`, `end_seconds=12` |
| Start position | `at 5 sec`, `from 5s` | `start_seconds=5` |
| Duration | `for 10 seconds`, `span for 10s` | `duration_seconds=10` |
| Length variants | `12s long`, `set to 12s`, `make it 8 sec` | `duration_seconds=12/8` |

The function also performs **post-derivations**:

* If `start_seconds` and `end_seconds` are present, compute `duration_seconds`
* If `start_seconds` and `duration_seconds` are present, compute `end_seconds`

**Security Note:** The regex patterns use disjoint character classes (`[0-9][0-9.]*[a-z]*`) to prevent polynomial backtracking vulnerabilities.

**Sources:** backend/main.py101-163

### Gemini API Integration

#### Model Configuration

```
model="gemini-2.5-flash"

response_schema = {

"type": "object",

"properties": {

"function_call": {

"type": "object",

"properties": {

"function_name": {"type": "string"},

"arguments": {"type": "object", "properties": {...}}

},

"required": ["function_name"]

},

"assistant_message": {"type": "string"}

}

}
```

The service uses **structured output generation** via `response_mime_type: "application/json"` and a predefined schema to ensure parseable responses.

**Sources:** backend/main.py227-271

#### Prompt Engineering

The system prompt defines the AI's behavior as "Kimu, an AI assistant inside a video editor" with specific instructions:

* **Tool Calling Policy:** Execute only when the user's intent is clear; otherwise ask for clarification
* **Timeline Semantics:** Tracks are 1-based ("track 1" means index 0), no timeline\_id required
* **Default Values:** `pixels_per_second = 100` if not provided
* **Asset Resolution:** Prefer `@mentions` (via `mentioned_scrubber_ids`), fallback to name matching
* **Time Interpretation:**
  + `"at 2 sec"` → `start_seconds = 2`
  + `"for 10 sec"` → `duration_seconds = 10`
  + `"from 2 sec to 12 sec"` → `start_seconds = 2`, `end_seconds = 12`

The prompt includes the full **tools catalog JSON schema** from `get_tools_catalog_json()`, which defines all available video editing operations.

**Sources:** backend/main.py272-319

#### Two-Pass Response Strategy

If Gemini returns only an `assistant_message` (being overly cautious), the system attempts a **second-pass retry**:

```
def _second_pass_force_tool(request: Message, assistant_note: str):

# Re-prompt: "You previously drafted a plan: <assistant_note>

# Now convert the user's latest instruction into exactly one tool call..."

response = gemini_api.models.generate_content(...)

return FunctionCallResponse.model_validate(data)
```

This ensures the AI attempts to generate actionable function calls when possible.

**Sources:** backend/main.py171-204

### Response Parsing and Validation

The service implements **resilient parsing** to handle SDK version differences:

```
JSON.loads()

Gemini Response Object

Try: response.parsed  
dict or object

Fallback: response.text  
JSON string

Last resort: response.to_dict()

Pydantic Validation  
FunctionCallResponse

_postprocess_response()  
Time normalization

Return to Frontend
```

**Error Handling:**

* Connection failures → 500 with "GEMINI\_API\_KEY not set"
* Unparseable responses → 500 with debug logs enabled
* Exceptions → Full traceback printed for debugging

**Sources:** backend/main.py334-401

### FastAPI Service

The **FastAPI container** (`videoeditor-fastapi`) provides AI-powered video editing features using the Gemini API.

#### Container Specification

| Property | Value |
| --- | --- |
| Base Image | `python:3.13-slim` |
| Container Name | `videoeditor-fastapi` |
| Build Context | `./backend` |
| Dockerfile | `backend/Dockerfile` (not shown in files) |
| Internal Port | `3000` |
| Package Manager | `uv` (fast Python dependency resolver) |

**Source:** docker-compose.yml60-64

The build context is the `backend/` subdirectory, which contains the Python FastAPI application and its dependencies. The service uses `uv` for fast dependency installation, as mentioned in the high-level architecture overview.

# Terminal 3: FastAPI

uv run backend/main.py  # Port 3000
```

**Source:** README.md85-92

**Local requirements:**

* Node.js 20+
* Python 3.9+
* PostgreSQL (local or remote)
* `pnpm` package manager

**Source:** README.md99-105

### Production Configuration

Production deployment uses the base `docker-compose.yml` without overrides:

```
docker compose up -d
```

**Source:** README.md114

**Production characteristics:**

* All services behind Nginx reverse proxy
* Internal ports not exposed to host
* TLS termination with Let's Encrypt certificates
* Resource limits enforced (memory, swap)
* Environment variables from `.env` file
* Persistent volumes for media and certificates

**Sources:** docker-compose.yml1-65 README.md109-129

### Configuration Comparison

| Aspect | Development | Production |
| --- | --- | --- |
| **Port Exposure** | All ports exposed | Only 80/443 exposed |
| **TLS** | Disabled | Enabled (Let's Encrypt) |
| **Hot Reload** | Enabled (volume mounts) | Disabled (built image) |
| **Resource Limits** | None | Backend: 2GB memory limit |
| **Nginx Routing** | Optional (can access directly) | Required (only entry point) |
| **Build Time** | Faster (no optimization) | Slower (full optimization) |

## Build Process

### FastAPI Build Pipeline

The FastAPI service build process uses Python's `uv` package manager:

1. Install Python 3.13 base image
2. Copy `pyproject.toml` and `uv.lock` (assumed)
3. Run `uv install` for fast dependency resolution
4. Start FastAPI with `uv run backend/main.py`

**Source:** README.md92

The use of `uv` provides significantly faster dependency installation compared to `pip`, as mentioned in the high-level architecture analysis.

## Resource Management and Performance

### Memory Allocation Strategy

The backend container has explicit memory limits optimized for video rendering workloads:

```
mem_limit: 2g

memswap_limit: 2g

shm_size: 1g
```

**Memory allocation breakdown:**

* **Container memory (2GB):** Total memory available to the Node.js process and FFmpeg subprocesses
* **Swap limit (2GB):** Prevents excessive swap usage that degrades rendering performance
* **Shared memory (1GB):** Used by FFmpeg for inter-process communication during parallel encoding

**Rationale:** Video rendering via FFmpeg is CPU-bound with moderate memory usage. The 2GB limit prevents memory exhaustion on shared infrastructure while allowing concurrent rendering jobs (typically 1-2 simultaneous renders).

## AI Assistant (Vibe AI)

The AI Assistant (internally called "Vibe AI") is a natural language interface for video editing operations, allowing users to manipulate timeline elements through conversational commands. This document covers the backend FastAPI service that processes AI requests, normalizes time expressions, and converts natural language into executable timeline operations.

For information about the timeline data structures that the AI manipulates, see [Timeline System](./timeline-readme.md). For details on the REST API endpoint specification, see [AI API](./ai-backend-readme.md).

## Natural Language Time Normalization

One of the most critical features of the AI Assistant is its ability to parse time expressions from natural language and convert them into precise numeric values.

### Time Conversion Function

The `_to_seconds()` function backend/main.py46-99 supports multiple formats:

| Input Format | Example | Output (seconds) |
| --- | --- | --- |
| Numeric | `5`, `5.5` | `5.0`, `5.5` |
| MM:SS | `"1:30"` | `90.0` |
| HH:MM:SS | `"1:30:45"` | `5445.0` |
| Compound units | `"1h 2m 3s"` | `3723.0` |
| Single unit | `"90s"`, `"2.5min"` | `90.0`, `150.0` |
| Milliseconds | `"500ms"` | `0.5` |

The regex pattern uses bounded quantifiers to prevent ReDoS attacks:

```
(?P<num>[0-9]{1,15}(?:\.[0-9]{1,10})?)[ ]?(?P<unit>milliseconds|...|m|s|h)\b
```

### Time Field Normalization from Text

The `_normalize_time_fields_from_text()` function backend/main.py101-162 extracts time parameters from natural language using pattern matching:

```
Post-Derivation

Extracted Values

Pattern Matchers

User text:  
'from 2s to 12s'

FROM...TO pattern  
regex: from\s+X\s+to\s+Y

AT/START AT pattern  
regex: at|starting at

FOR/SPAN FOR pattern  
regex: for|span for

...LONG pattern  
regex: X long

SET TO/MAKE IT pattern  
regex: set to|make it

start_seconds: 2.0

end_seconds: 12.0

duration_seconds: 10.0

If start + end present:  
duration = end - start  
  
If start + duration:  
end = start + duration
```

### Supported Natural Language Patterns

| Pattern | Example | Extracted Fields |
| --- | --- | --- |
| `from X to Y` | "from 2s to 12s" | `start_seconds=2.0`, `end_seconds=12.0` |
| `at X` | "at 5 seconds" | `start_seconds=5.0` |
| `for X` | "for 10s" | `duration_seconds=10.0` |
| `X long` | "12 seconds long" | `duration_seconds=12.0` |
| `set to X` | "set it to 8sec" | `duration_seconds=8.0` |
| `make it X` | "make it 5s" | `duration_seconds=5.0` |

The system performs post-derivation calculations backend/main.py153-161:

* If `start_seconds` and `end_seconds` are present but `duration_seconds` is missing: `duration = end - start`
* If `start_seconds` and `duration_seconds` are present but `end_seconds` is missing: `end = start + duration`

## Tool Calling System

### Gemini Model Configuration

The service uses `gemini-2.5-flash` with structured output mode backend/main.py273-320:

```
response = gemini_api.models.generate_content(

model="gemini-2.5-flash",

contents=f"""You are Kimu, an AI assistant inside a video editor.

Available tools: {get_tools_catalog_json()}

User message: {request.message}

Timeline state: {request.timeline_state}

Media bin items: {request.mediabin_items}

""",

config={

"response_mime_type": "application/json",

"response_schema": response_schema,

}

)
```

### Tool Selection Guidelines

The prompt provides semantic rules for the AI backend/main.py284-307:

| User Intent | Tool Selection Rule |
| --- | --- |
| References `@<asset>` | Use `AddMediaById` with `mentioned_scrubber_ids[0]` |
| References asset by name | Use `AddMediaByName` with `scrubber_name` |
| "Make it span for N seconds" | Call `AddMedia*` with `duration_seconds` |
| "From A sec to B sec" | Pass `start_seconds=A`, `end_seconds=B` |
| "Remove everything on track 2" | Call `DeleteScrubbersInTrack` with `track_number=2` |

## Second-Pass Retry Mechanism

When Gemini returns only an `assistant_message` (being overly cautious), the system attempts a second pass to force a tool call.

### Retry Flow

```
Yes

No

Yes

No

Yes

No

First Gemini Response

Has function_call?

Return function_call

Has assistant_message?

_second_pass_force_tool()

Build focused prompt:  
'You previously drafted: X  
Now convert to ONE tool call'

Gemini API (2nd call)

Extracted tool?

Return extracted tool

Return original assistant_message
```

### Implementation

The `_second_pass_force_tool()` function backend/main.py171-203 re-prompts Gemini with:

1. **Context from first response**: The original assistant note as a "plan"
2. **Explicit instruction**: "Now convert the user's latest instruction into exactly one tool call"
3. **Tools catalog**: Full JSON schema of available functions
4. **Timeline/media context**: Same state information as the first pass

The second pass uses the same `response_schema` and `response_mime_type` configuration to ensure structured output.

# AI Features (Required only for AI Assistant functionality)

GEMINI_API_KEY=your_gemini_api_key_here

# Supabase Integration (Optional)

VITE_SUPABASE_URL=https://your-project.supabase.co

VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Response Normalization

The `normalizeAuthUser` function (from `~/schemas/auth`) handles multiple possible response structures:

app/hooks/useAuth.ts62-65

```
const extractUser = (data: unknown): AuthUser | null => {

const u = normalizeAuthUser(data);

return u ? { id: u.id, email: u.email ?? null, name: u.name ?? null, image: u.image ?? null } : null;

};
```

### AuthResponse Shape

The Better Auth API may return user data in various nested structures:

app/hooks/useAuth.ts14-44

```
interface AuthResponse {

user?: { id?: string; userId?: string; email?: string; ... };

data?: { user?: { id?: string; userId?: string; ... } };

session?: { user?: { id?: string; ... }; userId?: string };

}
```

The normalization layer flattens these variations into a consistent `AuthUser` object.

Sources: app/hooks/useAuth.ts7-65 app/schemas/auth (referenced but not provided)

## Security Best Practices

### Current Security Measures

1. **Session-Based Auth** - No token storage in localStorage
2. **HTTP-Only Cookies** - Prevents XSS attacks
3. **HTTPS Enforcement** - All traffic encrypted
4. **HSTS** - Prevents protocol downgrade attacks
5. **Domain-Restricted Cookies** - Cookie scope limited to `trykimu.com`
6. **OAuth 2.0** - Industry-standard identity federation
7. **Protected Media Endpoints** - Authentication required for asset access
8. **Environment Isolation** - Separate dev/prod configurations
9. **Request Validation** - Route loaders check session server-side
10. **Nginx Reverse Proxy** - Central security enforcement point

### Configuration Summary Table

| Setting | Development | Production | Purpose |
| --- | --- | --- | --- |
| AUTH\_BASE\_URL | `http://localhost:5173` | `https://trykimu.com` | OAuth callback base |
| AUTH\_TRUSTED\_ORIGINS | `http://localhost:5173` | `https://trykimu.com,https://www.trykimu.com` | CORS whitelist |
| AUTH\_COOKIE\_DOMAIN | `localhost` | `trykimu.com` | Cookie scope |
| HTTPS | Not enforced | Enforced via Nginx | Transport security |
| HSTS | Disabled | Enabled | Force HTTPS |

Sources: docker-compose.yml27-35 docker-compose.yml46-48 nginx.conf20-36

## Development vs Production Differences

## Time Normalization System

The AI service implements a comprehensive time expression parser that converts natural language time specifications into numeric seconds. This is critical for video editing operations where precision is required.

### Time Parsing Function: `_to_seconds`

Converts various time formats to floating-point seconds.

**Supported formats:**

| Format | Example | Result (seconds) |
| --- | --- | --- |
| Plain number | `"5"` or `5` | 5.0 |
| Time codes | `"1:30"`, `"0:45:30"` | 90.0, 2730.0 |
| Unit expressions | `"2h30m"`, `"90s"`, `"2.5min"` | 9000.0, 90.0, 150.0 |
| Long-form units | `"5 seconds"`, `"10 minutes"` | 5.0, 600.0 |
| Milliseconds | `"500ms"`, `"1.5 seconds"` | 0.5, 1.5 |

* Uses bounded quantifiers in regex patterns to prevent ReDoS attacks: `r"[0-9]{1,15}(?:\.[0-9]{1,10})?"`
* Processes longest units first (hours, then minutes, then seconds) for additive parsing
* Returns `None` for unparseable inputs rather than raising exceptions
* Handles NaN by checking `v == v` (NaN != NaN in IEEE 754)

**Sources:** backend/main.py46-98

### Field Normalization: `_normalize_time_fields_from_text`

Extracts temporal relationships from natural language and populates argument fields.

```
Derivation

Field Population

Pattern Matching

User Text  
'from 2s to 12s for the intro'

FROM...TO Pattern  
regex: from\s+...to\s+

AT/START AT Pattern  
regex: (?:at|starting\s+at)

FOR Pattern  
regex: (?:for|span)

LONG/SET TO Pattern  
regex: ...long|set to

start_seconds:  
_to_seconds(match)

end_seconds:  
_to_seconds(match)

duration_seconds:  
_to_seconds(match)

if start + end → compute duration  
if start + duration → compute end

Updated arguments  
dict
```

**Diagram:** Time normalization pipeline showing pattern recognition, field population, and derived value computation.

**Recognized patterns:**

| Pattern | Regex Component | Populates |
| --- | --- | --- |
| `"from X to Y"` | `from\s+...to\s+` | `start_seconds`, `end_seconds` |
| `"at X"` / `"start at X"` | `(?:at|starting\s+at)` | `start_seconds` |
| `"for X"` / `"span for X"` | `(?:for|span(?:s)?\s+for)` | `duration_seconds` |
| `"X long"` / `"set to X"` | `...long|set\s+to` | `duration_seconds` |

**Derivation logic:**

* If `start_seconds` and `end_seconds` are present, compute `duration_seconds = end - start`
* If `start_seconds` and `duration_seconds` are present, compute `end_seconds = start + duration`
* All derived values use `max(0.0, ...)` to prevent negative durations

**Sources:** backend/main.py101-162 backend/main.py165-168

## Two-Pass Inference Strategy

The AI service implements a retry mechanism when the Gemini model returns only an assistant message instead of a function call. This handles cases where the model is overly cautious or needs additional prompting.

### First Pass: Standard Generation

The initial request provides full context and asks the model to return either a function call or an assistant message.

**Prompt structure:**

* System instructions defining Kimu's role and tool-calling policy
* Tools catalog with complete JSON schemas via `get_tools_catalog_json()`
* Chat history for conversation continuity
* Current user message with timeline/mediabin context

**Response schema constraints:**

* Minimal schema without `additionalProperties` to ensure Gemini compatibility
* Includes common argument fields: `scrubber_id`, `start_seconds`, `duration_seconds`, `fontSize`, etc.
* Does not use union types, which Gemini struggles with

**Sources:** backend/main.py227-320

### Second Pass: Forced Tool Call

If the first pass returns only an `assistant_message`, the service attempts a second pass that explicitly requests a tool call.

```
"gemini_api (retry)""_second_pass_force_tool""gemini_api (first)""process_ai_message"Frontend"gemini_api (retry)""_second_pass_force_tool""gemini_api (first)""process_ai_message"Frontend"Check: function_call is Noneand assistant_message exists""POST /ai{message, context}""generate_content(...)""{assistant_message: 'I can help...'}""force tool call retry""Convert plan to toolPrevious: {assistant_message}Tools: {catalog}""{function_call: {...}}""FunctionCallResponse""function_call or original message"
```

**Diagram:** Second-pass mechanism that retries with explicit tool-calling instructions when the first pass is too cautious.

**Second pass prompt:**

```
You previously drafted a plan:

{assistant_note}

Now convert the user's latest instruction into exactly one tool call if applicable.
Return strictly a JSON object with either function_call or assistant_message.
Available tools:
{get_tools_catalog_json()}

User message: {request.message}
Timeline state: {request.timeline_state}
Media bin items: {request.mediabin_items}
```

* Only triggered when `function_call is None` and `assistant_message is not None`
* Uses the same response schema as the first pass
* If second pass also fails, returns the original assistant message
* Errors in second pass are logged but don't fail the request

**Sources:** backend/main.py171-203 backend/main.py362-366 backend/main.py377-381

## Response Parsing and Validation

The service implements robust parsing to handle variations in the Gemini SDK response format across different versions.

### Parsing Hierarchy

```
Yes

No

Yes

No

Fail

Fail

Gemini Response Object

Try: response.parsed

Try: response.text  
(JSON string)

Try: response.to_dict()

Is dict?

Has attributes?

FunctionCallResponse  
.model_validate(dict)

Extract function_call  
and assistant_message attrs

json.loads(text)

_postprocess_response()  
Apply time normalization

Return FunctionCallResponse

HTTPException:  
No parseable content
```

**Diagram:** Multi-strategy response parsing that handles different SDK versions and response formats.

**Parsing strategies:**

1. **`response.parsed`** (preferred for SDK 1.22.0+)

* Check if `parsed` is a dict → validate directly
   * Check if `parsed` has attributes → extract `function_call` and `assistant_message`
   * Build dict from attributes and validate
2. **`response.text`** (fallback for JSON strings)

* Parse text as JSON
   * Validate with Pydantic model
3. **`response.to_dict()`** (last resort)

* Call method if available
   * Validate resulting dict

**Sources:** backend/main.py334-393

## Tool Execution Context

While this service only returns function calls (not execute them), it provides rich context to help the AI model select appropriate tools.

### Prompt Engineering for Tool Selection

The prompt sent to Gemini includes explicit guidance on tool selection:

**Tool calling policy:**

* Call ONE tool only when request is clear and safe
* Return `assistant_message` if ambiguous (asks clarifying question)
* Assume single active timeline (no `timeline_id` required)
* Tracks named `"track-1"` but users say "track 1" (1-based indexing)
* Default `pixels_per_second = 100` if not provided
* Prefer `@`-mentioned assets via `mentioned_scrubber_ids`

**Editing semantics:**

* `"at 2 sec"` → `start_seconds = 2`
* `"for 10 sec"` → `duration_seconds = 10`
* `"from 2 sec for 10 sec"` → `start_seconds = 2`, `duration_seconds = 10`
* `"from 2 sec to 12 sec"` → `start_seconds = 2`, `end_seconds = 12`
* Default duration: media's intrinsic duration, or 5 seconds for images

**Tool selection examples:**

* `@asset` reference → `AddMediaById` with `mentioned_scrubber_ids[0]`
* Asset name mention → `AddMediaByName` with `scrubber_name`
* "span for N seconds" → `AddMedia*` with `duration_seconds`
* "from A to B" → pass `start_seconds` and `end_seconds`
* "remove everything on track 2" → `DeleteScrubbersInTrack` with `track_number=2`

**Sources:** backend/main.py275-313

## Error Handling and Debugging

The service includes comprehensive error handling and debug logging.

### Debug Logging

```
# Incoming request summary

print("[AI] Incoming payload summary:", {

"message": request.message[:200] if request.message else None,

"mentioned_scrubber_ids": request.mentioned_scrubber_ids,

"timeline_state_present": request.timeline_state is not None,

"mediabin_count": len(request.mediabin_items or []),

"chat_history_count": len(request.chat_history or []),

})

# Response summary

print("[AI] Raw response type:", type(response))

print("[AI] candidates len:", len(response.candidates))

print("[AI] text preview:", response.text[:200])
```

**Sources:** backend/main.py213-332

### Error Responses

| Condition | Status Code | Detail |
| --- | --- | --- |
| `GEMINI_API_KEY` not set | 500 | "GEMINI\_API\_KEY is not set in environment" |
| Invalid JSON from model | 500 | "Invalid JSON from model: {exception}" |
| No parseable content | 500 | "Model returned no parseable content; enable debug logs for details" |
| Any other exception | 500 | Full exception message with traceback printed to stdout |

**Exception handling:**

* All exceptions caught at the endpoint level
* Full traceback printed via `traceback.print_exc()` for debugging
* Exceptions re-raised as `HTTPException` with original message

**Sources:** backend/main.py396-400

## CORS Configuration

The service enables unrestricted CORS to allow frontend access:

```
app.add_middleware(

CORSMiddleware,

allow_origins=["*"],

allow_credentials=True,

allow_methods=["*"],

allow_headers=["*"],

)
```

In production deployments behind Nginx, this is safe as Nginx restricts upstream access.

**Sources:** backend/main.py24-31

## Local Development Server

For local development, the service can be run directly:

```
if __name__ == "__main__":

import uvicorn

uvicorn.run(app, host="127.0.0.1", port=3000)
```

Run with: `python backend/main.py`

**Sources:** backend/main.py403-406

### 3. FastAPI Health Check

```
curl http://localhost:3000/health
```

```
{"status": "healthy"}
```

