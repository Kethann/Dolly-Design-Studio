/** Bound expensive image decoding per server process/isolate; never accumulate a queue of file buffers. */
export class ImageBusyError extends Error {
  constructor() {
    super("Another media upload is being processed. Wait a moment, then try this upload again.");
    this.name = "ImageBusyError";
  }
}

// The gate may outlive a route module reload, so do not rely on that module's class identity.
export const isImageBusyError = (error: unknown): error is ImageBusyError => error instanceof Error && error.name === "ImageBusyError";

export function createImageWorkGate() {
  let active = false;
  return async function run<T>(work: () => Promise<T>): Promise<T> {
    if (active) throw new ImageBusyError();
    active = true;
    try {
      return await work();
    } finally {
      active = false;
    }
  };
}

// Share the gate across route module instances and development reloads in the same process.
const runtime = globalThis as typeof globalThis & { __ddsImageWork?: ReturnType<typeof createImageWorkGate> };
export const runImageWork = runtime.__ddsImageWork ??= createImageWorkGate();
