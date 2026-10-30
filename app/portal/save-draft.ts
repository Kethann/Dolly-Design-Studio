export interface SaveJob {
  label: string;
  url: string;
  body: unknown;
  responseKey: string;
  accept: (saved: unknown) => void;
}

/** Apply server normalization only if the user has not made newer edits. */
export function reconcileSaved<T>(current: T, submitted: T, saved: T): T {
  return JSON.stringify(current) === JSON.stringify(submitted) ? saved : current;
}

export class SaveError extends Error {
  constructor(message: string, public readonly status: number, public readonly completed: string[]) {
    super(`${completed.length ? `${completed.join(" and ")} saved. ` : ""}${message}`);
  }
}

/** Commit each successful response immediately, so a retry never treats a partial save as wholly failed. */
export async function saveDraft(jobs: SaveJob[]) {
  const completed: string[] = [];
  for (const job of jobs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(job.url, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job.body), signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = response.status === 401
          ? "Your session expired. Sign in again in another tab, then retry here. Your edits are still here."
          : typeof data?.error === "string" ? data.error : `Couldn’t save ${job.label.toLowerCase()}. Please retry.`;
        throw new SaveError(message, response.status, [...completed]);
      }
      const saved = data?.[job.responseKey];
      if (!saved || typeof saved !== "object" || Array.isArray(saved) || Object.keys(saved).length === 0) {
        throw new SaveError(`The server did not confirm the saved ${job.label.toLowerCase()}. Your draft is still here; please retry.`, response.status, [...completed]);
      }
      job.accept(saved);
      completed.push(job.label);
    } catch (error) {
      if (error instanceof SaveError) throw error;
      throw new SaveError(controller.signal.aborted
        ? "The save took too long. Your draft is still here; check your connection and retry."
        : "Couldn’t finish saving. Your draft is still here; check your connection and retry.", 0, [...completed]);
    } finally {
      clearTimeout(timeout);
    }
  }
}
