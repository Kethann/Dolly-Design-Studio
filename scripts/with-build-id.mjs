// Runs a command with one build id for the whole build (NEXT_PUBLIC_BUILD_ID). The id is baked into both the server and the
// browser code, so a page that is already open can ask /api/version whether a newer deploy exists (see UpdateWatcher).
import { spawn } from "node:child_process";

const [cmd, ...args] = process.argv.slice(2);
const id = process.env.NEXT_PUBLIC_BUILD_ID || String(Date.now());
const child = spawn(cmd, args, { stdio: "inherit", shell: true, env: { ...process.env, NEXT_PUBLIC_BUILD_ID: id } });
child.on("exit", (code) => process.exit(code ?? 1));
