import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import process from "node:process";

// Account that owns both Dolly Design Studio Cloudflare deployments.
// An account ID is an identifier, not a secret; Wrangler still supplies authentication.
const CLOUDFLARE_ACCOUNT_ID = "d189f60c7af53b8c6e37cc60c1f43cd4";

const root = fileURLToPath(new URL("../", import.meta.url));
const pagesFront = resolve(root, "pages-front");
const executable = (...parts) => resolve(root, "node_modules", ...parts);

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "Unable to read Git metadata.\n");
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function run(label, command, args, options = {}) {
  process.stdout.write(`\n==> ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.stderr.write(`\nDeployment stopped during: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

const sha = capture("git", ["rev-parse", "HEAD"]);
const branch = capture("git", ["branch", "--show-current"]) || "main";
const commitMessage = capture("git", ["log", "-1", "--pretty=%s"]);
const dirty = capture("git", ["status", "--porcelain"]) !== "";

if (dirty) {
  process.stderr.write(
    "Deployment cancelled: commit or remove the current workspace changes first.\n" +
      "This keeps the Git commit, Worker version and Pages deployment in sync.\n",
  );
  process.exit(1);
}

const deployEnv = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || CLOUDFLARE_ACCOUNT_ID,
  NEXT_PUBLIC_BUILD_ID: sha,
  NEXT_PUBLIC_SITE_URL: "https://dollydesignstudio.pages.dev",
  DEPLOY_TARGET: "cloudflare",
};

run("Type checking", process.execPath, [executable("typescript", "bin", "tsc"), "--noEmit"]);
run("Linting", process.execPath, [executable("eslint", "bin", "eslint.js"), "."]);
run("Tests", process.execPath, ["--test", "tests/media-template.test.mjs"]);
run("Building the application Worker", process.execPath, [executable("@opennextjs", "cloudflare", "dist", "cli", "index.js"), "build"], {
  env: deployEnv,
});
run("Deploying the application Worker", process.execPath, [executable("@opennextjs", "cloudflare", "dist", "cli", "index.js"), "deploy"], {
  env: deployEnv,
});
run(
  "Refreshing dollydesignstudio.pages.dev",
  process.execPath,
  [
    executable("wrangler", "bin", "wrangler.js"),
    "pages",
    "deploy",
    "public",
    "--project-name",
    "dollydesignstudio",
    "--branch",
    branch,
    "--commit-hash",
    sha,
    "--commit-message",
    commitMessage,
    `--commit-dirty=${dirty}`,
  ],
  { cwd: pagesFront, env: deployEnv },
);

const liveUrls = [
  "https://dolly-design-studio.dollydesignstudios.workers.dev/api/version",
  "https://dollydesignstudio.pages.dev/api/version",
];

async function verifyRelease(url) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
      const payload = await response.json();
      if (response.ok && payload.id === sha) return;
      lastError = new Error(`expected ${sha}, received ${payload.id ?? response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`${url} did not reach the deployed commit: ${lastError?.message ?? "unknown response"}`);
}

process.stdout.write("\n==> Verifying that Worker and Pages serve the same commit\n");
await Promise.all(liveUrls.map(verifyRelease));

process.stdout.write(
  `\nDeployment complete.\nCommit: ${sha}\nLive site: https://dollydesignstudio.pages.dev/\n`,
);
