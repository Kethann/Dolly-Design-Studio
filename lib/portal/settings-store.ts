// Server-only: reads and writes the creator's intro settings.
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_INTRO_SETTINGS, sanitizeIntroSettings, type IntroSettings } from "@/lib/intro/settings";

const FILE = path.join(process.cwd(), "content", "intro-settings.json");

export async function readIntroSettings(): Promise<IntroSettings> {
  try {
    return sanitizeIntroSettings(JSON.parse(await readFile(FILE, "utf8")));
  } catch {
    return sanitizeIntroSettings(DEFAULT_INTRO_SETTINGS);
  }
}

/** Atomic write (temp file + rename) so a crash mid-save never leaves a half-written file. */
export async function writeIntroSettings(settings: IntroSettings): Promise<void> {
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(settings, null, 2) + "\n", "utf8");
  await rename(tmp, FILE);
}
