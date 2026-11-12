import { ImageResponse } from "next/og";
import { APP_NAME } from "@/shared/app";

export const alt = `${APP_NAME}: trivia night on your TV, with every phone as a buzzer`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VALUES = ["$200", "$400", "$600", "$800"];

/** Share card for links to the site: the name, the pitch and a small picture of the board. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "linear-gradient(135deg, #0a1a9e 0%, #0a1066 55%, #0b0f24 100%)", color: "white", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 48 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#ffcf3f", letterSpacing: 6, textTransform: "uppercase" }}>{APP_NAME}</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, marginTop: 20 }}>Trivia night on your TV.</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, color: "#ffcf3f" }}>Every phone is a buzzer.</div>
          <div style={{ fontSize: 30, marginTop: 28, color: "rgba(255,255,255,0.8)" }}>Free and open source. No app to install.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 380, gap: 10 }}>
          {VALUES.map((v) => (
            <div key={v} style={{ display: "flex", gap: 10 }}>
              {[0, 1, 2].map((c) => (
                <div key={c} style={{ display: "flex", flex: 1, height: 96, alignItems: "center", justifyContent: "center", background: "#0a1a9e", border: "3px solid #02043a", borderRadius: 10, fontSize: 34, fontWeight: 800, color: "#ffcf3f" }}>
                  {v}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
