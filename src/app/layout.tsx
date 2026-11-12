import type { Metadata, Viewport } from "next";
import { Inter, Lora, Oswald } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/shared/app";
import { DESCRIPTION, SITE_TITLE, siteUrl } from "@/shared/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-oswald" });
const lora = Lora({ subsets: ["latin"], weight: ["700"], variable: "--font-lora" });

// Defaults for every page; pages add their own title, description and canonical address.
// The share image comes from app/opengraph-image.tsx.
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: SITE_TITLE, template: `%s · ${APP_NAME}` },
  description: DESCRIPTION,
  applicationName: APP_NAME,
  keywords: ["trivia game", "quiz show game", "trivia night", "game night", "phone buzzer", "buzzer app", "classroom quiz", "self-hosted", "open source"],
  icons: { icon: "/favicon.svg" },
  openGraph: { type: "website", siteName: APP_NAME, title: SITE_TITLE, description: DESCRIPTION, locale: "en_US" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
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
