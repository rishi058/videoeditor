import React, { useEffect, useState } from "react";
import { Sequence, continueRender, delayRender, useVideoConfig } from "remotion";
import { SubtitlePage } from "./SubtitlePage";
import { createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";

export const SubtitleTrackRenderer: React.FC<{
  src: string;
}> = ({ src }) => {
  const [handle] = useState(() => delayRender("Loading subtitles"));
  const [pages, setPages] = useState<TikTokPage[] | null>(null);
  const { fps } = useVideoConfig();

  useEffect(() => {
    // Determine the correct API endpoint
    let fetchUrl = src;
    if (src.startsWith("/")) {
      const char = src.includes("?") ? "&" : "?";
      if (typeof window !== "undefined") {
         if (window.location.port === "5173" || window.location.port === "3000") {
            fetchUrl = src;
         } else {
            fetchUrl = `http://localhost:5173${src}${char}render=true`;
         }
      } else {
         fetchUrl = `http://localhost:5173${src}${char}render=true`;
      }
    }

    fetch(fetchUrl)
      .then((res) => {
         if (!res.ok) throw new Error("Network not ok");
         return res.json();
      })
      .then((json) => {
        let finalPages: TikTokPage[] = [];
        if (Array.isArray(json)) {
          // Wrap whisper tokens
          const { pages: generatedPages } = createTikTokStyleCaptions({
            captions: json,
            combineTokensWithinMilliseconds: 200,
          });
          finalPages = generatedPages;
        } else if (json.pages) {
          finalPages = json.pages;
        }
        setPages(finalPages);
        continueRender(handle);
      })
      .catch((err) => {
        console.error("Failed to load subtitles", err);
        // Fallback for rendering side if the backend URL is unreachable directly
        // Just cancel the delayRender so frame continues rendering seamlessly
        continueRender(handle);
      });
  }, [src, handle]);

  if (!pages) {
    return null;
  }

  return (
    <>
      {pages.map((page: TikTokPage, index: number) => {
        const fromFrame = Math.round((page.startMs / 1000) * fps);
        const lastToken = page.tokens[page.tokens.length - 1];
        
        let toFrame = 0;
        if (index < pages.length - 1) {
          toFrame = Math.round((pages[index + 1].startMs / 1000) * fps);
        } else if (lastToken) {
          // Last page
          toFrame = Math.round((lastToken.toMs / 1000) * fps);
        } else {
           toFrame = fromFrame + 30; // 1s fallback
        }

        const duration = Math.max(1, toFrame - fromFrame);

        return (
          <Sequence
            key={index}
            from={fromFrame}
            durationInFrames={duration}
          >
             {/* SubtitlePage computes enterProgress internally now using spring */}
            <SubtitlePage page={page} />
          </Sequence>
        );
      })}
    </>
  );
};
