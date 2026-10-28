// Server-only: reads and writes the creator's design settings, through the storage layer.
import { connection } from "next/server";
import bundledSettings from "@/content/intro-settings.json";
import { DEFAULT_INTRO_SETTINGS, sanitizeIntroSettings, type IntroSettings } from "@/lib/intro/settings";
import { onCloudflare, readJson, writeJson } from "@/lib/storage";

const KEY = "content/intro-settings.json";

let remembered: { at: number; value: IntroSettings } | null = null;
const REMEMBER_MS = 4000;

/** What was saved from the portal; until something is saved there, the settings that came with the site. */
export async function readIntroSettings(): Promise<IntroSettings> {
  if (onCloudflare()) {
    try {
      await connection();
    } catch {}
    if (remembered && Date.now() - remembered.at < REMEMBER_MS) return remembered.value;
  }
  let value: IntroSettings;
  try {
    value = sanitizeIntroSettings((await readJson<unknown>(KEY)) ?? bundledSettings);
  } catch {
    value = sanitizeIntroSettings(DEFAULT_INTRO_SETTINGS);
  }
  if (onCloudflare()) remembered = { at: Date.now(), value };
  return value;
}

export async function writeIntroSettings(settings: IntroSettings): Promise<void> {
  await writeJson(KEY, settings, true);
  remembered = null;
}
