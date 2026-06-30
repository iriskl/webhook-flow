import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";

const API_BASE = process.env.PUBLIC_API_BASE_URL ?? "http://localhost:4000";

if (process.argv.includes("--self-test")) {
  assert.equal(repoFullName("git@github.com:course/webhook-flow.git", "x"), "course/webhook-flow");
  assert.equal(repoFullName("https://github.com/course/webhook-flow.git", "x"), "course/webhook-flow");
  assert.match(signPayload("wfsec_demo", "{}"), /^sha256=[a-f0-9]{64}$/);
  console.log("send-git-push self-test passed");
  process.exit(0);
}

const [hook, secret, repoDir = "."] = process.argv.slice(2);
if (!hook || !secret) {
  console.error("用法：node scripts/send-git-push.mjs <endpoint-slug|/hooks/slug|url> <endpoint-secret> [repo-dir]");
  process.exit(1);
}

const payload = buildPayload(repoDir);
const raw = JSON.stringify(payload);
const response = await fetch(toHookUrl(hook), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-webhook-flow-signature": signPayload(secret, raw)
  },
  body: raw
});

const body = await response.text();
console.log(`发送 git push payload：${payload.repository.full_name} ${payload.after.slice(0, 7)}`);
console.log(`HTTP ${response.status} ${body}`);
if (!response.ok) process.exit(1);

function buildPayload(cwd) {
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  const after = git(root, ["rev-parse", "HEAD"]);
  const before = git(root, ["rev-parse", "HEAD~1"], "0000000000000000000000000000000000000000");
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const name = basename(root);
  const fullName = repoFullName(git(root, ["config", "--get", "remote.origin.url"], ""), name);
  return {
    ref: `refs/heads/${branch}`,
    before,
    after,
    repository: { name, full_name: fullName },
    pusher: {
      name: git(root, ["config", "user.name"], "git-user"),
      email: git(root, ["config", "user.email"], "git-user@example.com")
    },
    commits: [
      {
        id: after,
        message: git(root, ["log", "-1", "--pretty=%s"]),
        timestamp: git(root, ["log", "-1", "--pretty=%cI"])
      }
    ]
  };
}

function git(cwd, args, fallback) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", fallback === undefined ? "pipe" : "ignore"]
    }).trim();
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

function repoFullName(remote, repoName) {
  const cleaned = remote.replace(/\.git$/, "");
  const match = cleaned.match(/[:/]([^/:]+\/[^/]+)$/);
  return match?.[1] ?? `local/${repoName}`;
}

function toHookUrl(input) {
  if (input.startsWith("http://") || input.startsWith("https://")) return input;
  if (input.startsWith("/")) return `${API_BASE}${input}`;
  return `${API_BASE}/hooks/${input}`;
}

function signPayload(secret, rawBody) {
  const signingKey = createHash("sha256").update(secret).digest("hex");
  const digest = createHmac("sha256", signingKey).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}
