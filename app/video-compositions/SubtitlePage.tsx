import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { type TikTokPage } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadFont("normal", { weights: ["400"] });

const DESIRED_FONT_SIZE = 35;

// How many frames for the fade-in and fade-out
const FADE_FRAMES = 6;

export const SubtitlePage: React.FC<{
  readonly page: TikTokPage;
}> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // --- Fade in at the start, fade out at the end ---
  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: "8%",
      }}
    >
      <div
        style={{
          opacity,
          textAlign: "center",
          maxWidth: "85%",
          // Movie caption style
          fontSize: DESIRED_FONT_SIZE,
          fontFamily,
          fontWeight: 700,
          color: "#ffffff",
          // Thin black outline via text-stroke + text-shadow for depth
          WebkitTextStroke: "2px #000000",
          textShadow:
            "0px 2px 8px rgba(0,0,0,0.85), 0px 0px 2px rgba(0,0,0,1)",
          letterSpacing: "0.02em",
          lineHeight: 1.25,
          // Ensure stroke renders under fill
          paintOrder: "stroke fill",
        }}
      >
        {page.text}
      </div>
    </AbsoluteFill>
  );
};
