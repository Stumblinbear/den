// UserPromptSubmit half of the implementer-diagnostics relay. Mirrors
// review-triage-inject.mjs: UserPromptSubmit's additionalContext DOES land in
// the parent/orchestrator model's context (unlike SubagentStop's), so this is
// where the reminder is injected. It reads every completion file
// implementer-diagnostics-flag.mjs dropped, injects one reminder naming the
// agent(s), and deletes exactly the files it read. A file written after the
// listing is picked up next time. No pending files -> emit nothing. Exits 0.
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = join(tmpdir(), "claude-implementer-diagnostics");

function reminder(pending) {
  const who = pending
    .map((p) => p.agent_type)
    .filter(Boolean)
    .join(", ");
  return [
    `${pending.length} implementer agent(s) reported finishing${who ? ` (${who})` : ""}.`,
    "Any rust-analyzer / IDE diagnostics that appeared after their edits are a",
    "stale mid-edit state, NOT findings. Do not run `cargo check` to 'verify'",
    "them, do not narrate a contradiction between the agent's report and the",
    "diagnostics, and do not treat them as a problem to solve. Trust the reported",
    "completion; the real arbiter is a build or test you were already going to",
    "run -- if you are about to run `cargo test`, go straight to it, and only act",
    "on diagnostics that survive that build.",
  ].join(" ");
}

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  let files = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  } catch {
    process.exit(0); // no directory yet -> nothing pending
  }
  if (files.length === 0) {
    process.exit(0);
  }
  const pending = [];
  for (const f of files) {
    const path = join(DIR, f);
    try {
      pending.push(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      // unreadable/partial file: skip it, still remove it below
    }
    try {
      unlinkSync(path);
    } catch {
      // already claimed by a concurrent injector -- harmless
    }
  }
  if (pending.length === 0) {
    process.exit(0);
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: reminder(pending),
      },
    }),
  );
  process.exit(0);
});
