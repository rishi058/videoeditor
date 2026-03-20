import fs from "fs";
import path from "path";

const OUT_DIR = path.resolve("out");

export async function loader({ request }: { request: Request }) {
  if (!fs.existsSync(OUT_DIR)) {
    return new Response(JSON.stringify({ files: [], outDir: OUT_DIR }), { 
      status: 200,
      headers: { "Content-Type": "application/json" } 
    });
  }

  try {
    const files = fs.readdirSync(OUT_DIR);
    const mediaFiles = files
      .filter(f => f.toLowerCase().endsWith(".mp4") || f.toLowerCase().endsWith(".mp3"))
      .map(f => ({
        name: f,
        absolutePath: path.join(OUT_DIR, f).split(path.sep).join('/')
      }));
    
    return new Response(JSON.stringify({ files: mediaFiles, outDir: OUT_DIR.split(path.sep).join('/') }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error reading out directory", error);
    return new Response(JSON.stringify({ files: [], outDir: OUT_DIR }), { 
      status: 500,
      headers: { "Content-Type": "application/json" } 
    });
  }
}
