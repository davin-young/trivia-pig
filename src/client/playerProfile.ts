import type { Drawing } from "@/shared/strokes";
import type { ProfileView } from "@/server/playerProfile";

export type { ProfileView };

const REMEMBER_KEY = "tp.remember";

/** "Remember me on this device" is on until someone turns it off. */
export function wantsRemembering(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}
export function setRemembering(on: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, on ? "1" : "0");
  } catch {}
}

export async function fetchProfile(): Promise<ProfileView | null> {
  try {
    const r = await fetch("/api/player", { cache: "no-store" });
    if (!r.ok) return null;
    return ((await r.json()) as { profile: ProfileView | null }).profile;
  } catch {
    return null;
  }
}

export async function saveProfile(input: { name: string; signature?: Drawing | null; avatar?: Drawing | null }): Promise<{ profile?: ProfileView; error?: string }> {
  try {
    const r = await fetch("/api/player", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const data = (await r.json().catch(() => null)) as { profile?: ProfileView; error?: string } | null;
    return r.ok && data?.profile ? { profile: data.profile } : { error: data?.error ?? "Could not save. Try again." };
  } catch {
    return { error: "Could not reach the server. Check your connection and try again." };
  }
}

export async function forgetProfile(): Promise<boolean> {
  try {
    return (await fetch("/api/player", { method: "DELETE" })).ok;
  } catch {
    return false;
  }
}

/** Count this seat's result toward the saved player. Quietly does nothing when it can't. */
export async function linkSeat(playerToken: string | undefined): Promise<void> {
  if (!playerToken) return;
  try {
    await fetch("/api/player/seat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerToken }) });
  } catch {}
}
