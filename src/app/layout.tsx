import type { Metadata, Viewport } from "next";
import { Inter, Lora, Oswald } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-oswald" });
const lora = Lora({ subsets: ["latin"], weight: ["700"], variable: "--font-lora" });

export const metadata: Metadata = {
  title: { default: "Trivia Pig", template: "%s · Trivia Pig" },
  description: "Self-hosted, real-time quiz-show game: big-screen display, iPad host controls, and phone buzzers.",
  applicationName: "Trivia Pig",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f24",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${oswald.variable} ${lora.variable}`}>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
