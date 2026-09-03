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

// Guidance on fix/defer/skip only -- never license to omit or soften a finding.
function reminder(pending) {
  const who = pending
    .map((p) => p.agent_type)
    .filter(Boolean)
    .join(", ");
  return [
    `${pending.length} review agent(s) completed${who ? ` (${who})` : ""}.`,
    "Reviewers surface every finding they can; deciding what actually gets fixed",
    "is the coordinating session's judgment, not theirs. Relay every finding to",
    "the user (guidance on fix/defer decisions, never license to omit or soften a",
    "finding), pair each with your own fix/defer/skip recommendation and the",
    "reasoning behind it, and weigh each finding's real-world impact against the",
    "cost and risk of addressing it now.",
    "Explain each finding in plain concrete language: set the scene first (what",
    "is on screen or in play, what changes, what goes observably wrong) before",
    "naming any mechanism, and write for a reader who has not read the code --",
    "translate the reviewer's jargon, never relay it.",
    "Filter test-gap findings through the discrimination bar before recommending",
    "them: a proposed test must catch a bug class that survives direct code",
    "reading -- trivial pure-function boundary tests and tests of",
    "visibly-single-path plumbing get a skip recommendation, not a fix.",
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
