import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: 32,
                    height: 32,
                    background: "#0a0a0a",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {/* Shield shape using SVG */}
                <svg
                    width="22"
                    height="24"
                    viewBox="0 0 22 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    {/* Shield path */}
                    <path
                        d="M11 1L2 4.5V11C2 16.25 5.9 21.15 11 22.5C16.1 21.15 20 16.25 20 11V4.5L11 1Z"
                        fill="white"
                    />
                    {/* Git branch icon inside */}
                    <circle cx="8.5" cy="7" r="1.5" fill="#7c3aed" />
                    <circle cx="13.5" cy="7" r="1.5" fill="#7c3aed" />
                    <circle cx="8.5" cy="17" r="1.5" fill="#7c3aed" />
                    <line x1="8.5" y1="8.5" x2="8.5" y2="15.5" stroke="#7c3aed" strokeWidth="1.5" />
                    <path
                        d="M13.5 8.5 Q13.5 12 8.5 12"
                        stroke="#7c3aed"
                        strokeWidth="1.5"
                        fill="none"
                    />
                </svg>
            </div>
        ),
        { ...size }
    );
}
