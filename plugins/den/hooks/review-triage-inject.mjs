// UserPromptSubmit half of the review-triage relay. UserPromptSubmit's
// additionalContext DOES land in the parent/orchestrator model's context
// (unlike SubagentStop's), so this is where the reminder is injected. It reads
// every completion file review-triage-flag.mjs dropped in the temp directory,
// injects one reminder naming all of them, and deletes exactly the files it
// read. A file written after the directory listing is untouched and picked up
// next time. No pending files -> emit nothing. Always exits 0.
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = join(tmpdir(), "claude-review-triage");

// A pointer, not a restatement: the rules live in the coordination skill's
// Review section, and this fires many turns after that skill was loaded.
function reminder(pending) {
  const who = pending
    .map((p) => p.agent_type)
    .filter(Boolean)
    .join(", ");
  return [
    `${pending.length} review agent(s) completed${who ? ` (${who})` : ""}.`,
    "Triage their findings under the coordination skill's review rules: every",
    "finding reaches the user with your fix, defer or skip call and its",
    "reasoning, explained for someone who has not read the code; what is",
    "unquestionably wrong goes back to its agent as the defect, not the",
    "reviewer's repair.",
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
