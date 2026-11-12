import { APP_NAME } from "./app";

/** Public address of this site (APP_URL), used for canonical links, the sitemap and share cards. */
export function siteUrl(): URL {
  try {
    return new URL(process.env.APP_URL || "https://triviapig.lol");
  } catch {
    return new URL("https://triviapig.lol");
  }
}

export const TAGLINE = "Trivia night on your TV, with every phone as a buzzer";
export const DESCRIPTION =
  "Free, open-source quiz-show game for game nights and classrooms. Put the board on a TV, host from any device, and let players buzz in from their phones. No app to install.";
export const SITE_TITLE = `${APP_NAME}: trivia night on your TV, with every phone as a buzzer`;
