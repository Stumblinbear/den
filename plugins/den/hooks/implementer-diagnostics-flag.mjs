// SubagentStop half of the implementer-diagnostics relay. Mirrors
// review-triage-flag.mjs: a SubagentStop hook cannot write into the
// parent/orchestrator's context (its additionalContext goes to the subagent
// and loops it), so this half only records that a matched implementer agent
// finished and emits NOTHING. The UserPromptSubmit half
// (implementer-diagnostics-inject.mjs) does the actual injection on the next
// turn -- which is exactly when the coordinator is re-invoked after the
// subagent completes.
//
// Why it exists: after an implementer edits many files, rust-analyzer/IDE
// diagnostics lag in a stale mid-edit state. The coordinator kept "verifying"
// them with a throwaway `cargo check` and narrating a non-existent
// contradiction between the agent's report and the diagnostics. This reminder
// tells it to trust the reported completion and let the build/test it was
// already going to run be the arbiter.
//
// Concurrency: implementers can finish alongside other subagents, so each
// completion drops its OWN file keyed by agent_id -- never a shared
// read-modify-write file. Matched in settings, but the matcher does not
// reliably scope a SubagentStop hook, so the agent_type is filtered here too.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = join(tmpdir(), "claude-implementer-diagnostics");

// The agent type arrives bare from a user-level definition and plugin-scoped
// ("den:<name>" or "plugin_den_<name>") from the den plugin; compare the bare name.
const bareType = (t) => String(t ?? "").replace(/^(den:|plugin_den_)/, "");

// Agents that edit the working tree and report a finished state. Any of them
// leaves rust-analyzer lagging, so all of them get the reminder.
const IMPLEMENTERS = [
  "implementer-opus",
  "implementer-haiku",
  "implementer-fable",
  "red-green-fixer",
];

// Whether the finished subagent edited a Rust source. Its transcript sits under
// the main transcript's directory, keyed by agent_id; every edit is an
// assistant tool_use block (Edit, Write, MultiEdit, NotebookEdit) whose input
// carries file_path. The reminder is about rust-analyzer lag, so an implementer
// that touched no .rs file leaves no flag. No transcript means no evidence,
// which also leaves no flag.
function editedRust(transcriptPath, agentId) {
  if (!transcriptPath || !agentId) return false;
  const file = join(String(transcriptPath).replace(/\.jsonl$/, ""), "subagents", `agent-${agentId}.jsonl`);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  for (const line of text.split("\n")) {
    if (!line.includes('"tool_use"')) continue;
    try {
      const j = JSON.parse(line);
      if (j.type !== "assistant") continue;
      for (const b of j.message?.content ?? []) {
        if (b.type !== "tool_use") continue;
        if (!["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(b.name)) continue;
        if (/\.rs$/i.test(String(b.input?.file_path ?? b.input?.notebook_path ?? ""))) return true;
      }
    } catch {}
  }
  return false;
}

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(data || "{}");
    if (!IMPLEMENTERS.includes(bareType(input.agent_type))) {
      process.exit(0);
    }
    if (!editedRust(input.transcript_path, input.agent_id)) {
      process.exit(0);
    }
    mkdirSync(DIR, { recursive: true });
    // agent_id is unique per subagent (one completion each), so it is both a
    // collision-free name and idempotent. Fall back to a unique token if it is
    // ever absent. Sanitize to keep it a safe filename.
    const raw =
      input.agent_id ||
      `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const name = String(raw).replace(/[^A-Za-z0-9._-]/g, "_");
    writeFileSync(
      join(DIR, `${name}.json`),
      JSON.stringify({
        agent_type: input.agent_type ?? "unknown",
        agent_id: input.agent_id ?? null,
        at: new Date().toISOString(),
      }),
    );
  } catch {
    // never fail loudly: a broken flag write must not block the subagent
  }
  process.exit(0);
});
