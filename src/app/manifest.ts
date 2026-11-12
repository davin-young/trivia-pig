import type { MetadataRoute } from "next";
import { APP_NAME } from "@/shared/app";
import { DESCRIPTION } from "@/shared/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f24",
    theme_color: "#0b0f24",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
