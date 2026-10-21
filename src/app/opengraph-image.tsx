import { ImageResponse } from "next/og";
import { LOGO_HEX, LOGO_SLICES, LOGO_STROKE, LOGO_VIEWBOX } from "@/components/brand/logo-mark";

export const alt = "ambagan: split it, settle it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CANDY = "#c42650";

/** The link preview for every page that does not set its own: the coin mark, the wordmark and the tagline on a sticker card. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff4f2" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 56,
            padding: "56px 84px 56px 64px",
            borderRadius: 56,
            background: "#ffffff",
            border: `6px solid ${LOGO_HEX.ink}`,
            boxShadow: `14px 14px 0 ${CANDY}`,
            color: LOGO_HEX.ink,
          }}
        >
          <svg width={300} height={300} viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}>
            {LOGO_SLICES.map((slice) => (
              <path key={slice.id} d={slice.d} transform={slice.transform} fill={LOGO_HEX[slice.id]} stroke={LOGO_HEX.ink} strokeWidth={LOGO_STROKE} strokeLinejoin="round" />
            ))}
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 132, fontWeight: 800, lineHeight: 1 }}>ambagan</div>
            <div style={{ fontSize: 46, fontWeight: 600 }}>split it, settle it.</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
