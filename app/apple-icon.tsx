import { ImageResponse } from "next/og";

/** The home-screen icon: the Vortaly mark at 180 px (same geometry as app/icon.svg). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1d4ed8" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path
            d="M9.5 10.5 16 22.5 19.6 15.8"
            fill="none"
            stroke="#fff"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M23 5.2c.5 2.6 1.6 3.7 4.2 4.2-2.6.5-3.7 1.6-4.2 4.2-.5-2.6-1.6-3.7-4.2-4.2 2.6-.5 3.7-1.6 4.2-4.2z"
            fill="#fff"
          />
        </svg>
      </div>
    ),
    size,
  );
}
