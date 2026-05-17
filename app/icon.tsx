import { ImageResponse } from "next/og";

export const size        = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192, height: 192,
          background: "linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)",
          borderRadius: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Briefcase icon drawn in SVG */}
        <svg width="108" height="108" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <line x1="12" y1="12" x2="12" y2="12.01" />
          <path d="M2 12.5h20" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
