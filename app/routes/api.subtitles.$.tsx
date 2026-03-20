import { auth } from "~/lib/auth.server";
import fs from "fs";
import path from "path";

const OUT_DIR = path.resolve("out");

async function requireUserId(request: Request): Promise<string> {
  try {
    // @ts-ignore - runtime API may not be typed
    const session = await auth.api?.getSession?.({ headers: request.headers });
    const userId: string | undefined = session?.user?.id ?? session?.session?.userId;
    if (userId) return String(userId);
  } catch {
    console.error("Failed to get session from auth API");
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:5173";
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;
  const cookie = request.headers.get("cookie") || "";
  const res = await fetch(`${base}/api/auth/session`, {
    headers: { Cookie: cookie, Accept: "application/json" },
    method: "GET",
  });
  if (!res.ok) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const json = await res.json().catch(() => ({}));
  const uid: string | undefined =
    json?.user?.id || json?.user?.userId || json?.session?.user?.id || json?.session?.userId || json?.data?.user?.id || json?.data?.user?.userId;
  if (!uid) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return String(uid);
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const isRenderRequest = url.searchParams.get("render") === "true";

  if (url.pathname === "/api/subtitles" && request.method === "GET") {
    await requireUserId(request);
    if (!fs.existsSync(OUT_DIR)) {
      return new Response(JSON.stringify({ subtitles: [] }), { headers: { "Content-Type": "application/json" } });
    }

    const files = fs.readdirSync(OUT_DIR).filter(file => file.endsWith(".json"));
    
    const subtitles = files.map(file => {
      const filePath = path.join(OUT_DIR, file);
      const stat = fs.statSync(filePath);
      
      let durationInSeconds = 0;
      let firstToMs = 0;
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
           const first = parsed[0];
           const last = parsed[parsed.length - 1];
           if (last.endMs && first.startMs !== undefined) {
              durationInSeconds = (last.endMs - first.startMs) / 1000;
           }
        } else if (parsed.pages && parsed.pages.length > 0) {
           const pages = parsed.pages;
           const lastPage = pages[pages.length - 1];
           const lastToken = lastPage.tokens[lastPage.tokens.length - 1];
           const firstToken = pages[0].tokens[0];
           if (lastToken && lastToken.toMs) {
             durationInSeconds = (lastToken.toMs - firstToken.fromMs) / 1000;
           }
        }
      } catch (err) {
        console.error(`Failed to parse ${file}`, err);
      }

      return {
        id: file, // Use filename as ID since these are just local artifacts
        name: file,
        size: stat.size,
        path: `/api/subtitles/${encodeURIComponent(file)}`,
        created_at: stat.birthtime,
        durationInSeconds: durationInSeconds
      };
    });

    return new Response(JSON.stringify({ subtitles }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET raw JSON content for a subtitle file
  const rawMatch = url.pathname.match(/\/api\/subtitles\/([^/]+)$/);
  if (rawMatch && request.method === "GET") {
    if (!isRenderRequest) {
      try {
        await requireUserId(request);
      } catch {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    const filename = decodeURIComponent(rawMatch[1]);
    const filePath = path.join(OUT_DIR, filename);

    if (!filePath.startsWith(OUT_DIR) || !fs.existsSync(filePath)) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stream = fs.createReadStream(filePath);
    return new Response(stream as unknown as BodyInit, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

export async function action({ request }: { request: Request }) {
  await requireUserId(request);

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const deleteMatch = url.pathname.match(/\/api\/subtitles\/([^/]+)$/);
    if (!deleteMatch) {
      return new Response(JSON.stringify({ error: "Missing filename" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const filename = decodeURIComponent(deleteMatch[1]);
    const filePath = path.join(OUT_DIR, filename);
    if (!filePath.startsWith(OUT_DIR) || !fs.existsSync(filePath)) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    fs.unlinkSync(filePath);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (request.method === "PUT") {
    const url = new URL(request.url);
    const putMatch = url.pathname.match(/\/api\/subtitles\/([^/]+)$/);
    if (!putMatch) {
      return new Response(JSON.stringify({ error: "Missing filename" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const filename = decodeURIComponent(putMatch[1]);
    const filePath = path.join(OUT_DIR, filename);
    if (!filePath.startsWith(OUT_DIR)) {
      return new Response(JSON.stringify({ error: "Invalid path" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    let body: string;
    try {
      body = await request.text();
      JSON.parse(body); // validate JSON
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    fs.writeFileSync(filePath, body, "utf-8");
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const media = formData.get("media");

    if (!(media instanceof Blob)) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const filename = (media as any).name || `subtitle-${Date.now()}.json`;
    if (!filename.endsWith(".json")) {
      return new Response(JSON.stringify({ error: "Only .json files are allowed for subtitles" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!fs.existsSync(OUT_DIR)) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    const filePath = path.join(OUT_DIR, filename);
    const buffer = Buffer.from(await media.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    let durationInSeconds = 0;
    try {
      const content = buffer.toString("utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
         const first = parsed[0];
         const last = parsed[parsed.length - 1];
         if (last.endMs && first.startMs !== undefined) {
            durationInSeconds = (last.endMs - first.startMs) / 1000;
         }
      } else if (parsed.pages && parsed.pages.length > 0) {
          const pages = parsed.pages;
          const lastPage = pages[pages.length - 1];
          const lastToken = lastPage.tokens[lastPage.tokens.length - 1];
          const firstToken = pages[0].tokens[0];
          if (lastToken && lastToken.toMs) {
            durationInSeconds = (lastToken.toMs - firstToken.fromMs) / 1000;
          }
      }
    } catch (e) {
      console.error("Failed to parse subtitle duration during upload", e);
    }

    return new Response(JSON.stringify({
      success: true,
      subtitle: {
        id: filename,
        name: filename,
        path: `/api/subtitles/${encodeURIComponent(filename)}`,
        durationInSeconds: durationInSeconds
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}
