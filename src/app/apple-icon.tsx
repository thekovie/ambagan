import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home-screen icon: a rose sticker with a heart. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff4f2" }}>
        <div style={{ width: 128, height: 128, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 40, background: "#f6b4bb", border: "7px solid #3a1d36", fontSize: 72, color: "#3a1d36" }}>
          ♥
        </div>
      </div>
    ),
    size,
  );
}
