import { ImageResponse } from "next/og";

export const alt = "ambagan: split it, settle it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The brand's soft pastels as plain hex: the image renderer cannot read the app's oklch tokens.
const INK = "#3a1d36";
const CANDY = "#c42650";

/** The link preview for every page that does not set its own: wordmark and tagline on a pastel sticker sheet. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff4f2" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            padding: "64px 80px",
            borderRadius: 56,
            background: "#ffffff",
            border: `6px solid ${INK}`,
            boxShadow: `14px 14px 0 ${CANDY}`,
            color: INK,
          }}
        >
          <div style={{ display: "flex", gap: 14 }}>
            {["#f6b4bb", "#b7e8cf", "#fbe89b", "#c9b8ef", "#a9d0f5"].map((c) => (
              <div key={c} style={{ width: 56, height: 56, borderRadius: 18, background: c, border: `4px solid ${INK}` }} />
            ))}
          </div>
          <div style={{ fontSize: 132, fontWeight: 800, lineHeight: 1 }}>ambagan</div>
          <div style={{ fontSize: 48, fontWeight: 600 }}>split it, settle it.</div>
        </div>
      </div>
    ),
    size,
  );
}
