import { ImageResponse } from "next/og";
import { LOGO_HEX, LOGO_SLICES, LOGO_STROKE, LOGO_VIEWBOX } from "@/components/brand/logo-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home-screen icon: the coin mark on the pastel ground. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff4f2" }}>
        <svg width={150} height={150} viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}>
          {LOGO_SLICES.map((slice) => (
            <path key={slice.id} d={slice.d} transform={slice.transform} fill={LOGO_HEX[slice.id]} stroke={LOGO_HEX.ink} strokeWidth={LOGO_STROKE} strokeLinejoin="round" />
          ))}
        </svg>
      </div>
    ),
    size,
  );
}
