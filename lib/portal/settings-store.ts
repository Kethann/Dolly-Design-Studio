// Server-only: reads and writes the creator's design settings, through the storage layer.
import bundledSettings from "@/content/intro-settings.json";
import { DEFAULT_INTRO_SETTINGS, sanitizeIntroSettings, type IntroSettings } from "@/lib/intro/settings";
import { readJson, writeJsonSafely } from "@/lib/storage";

const KEY = "content/intro-settings.json";

/** What was saved from the portal; until something is saved there, the settings that came with the site. */
export async function readIntroSettings(): Promise<IntroSettings> {
  // A static public shell is refreshed by IntroSettingsProvider in the browser.
  let value: IntroSettings;
  try {
    value = sanitizeIntroSettings((await readJson<unknown>(KEY)) ?? bundledSettings);
  } catch {
    value = sanitizeIntroSettings(DEFAULT_INTRO_SETTINGS);
  }
  return value;
}

export async function writeIntroSettings(settings: IntroSettings): Promise<void> {
  await writeJsonSafely(KEY, settings, "design");
}
