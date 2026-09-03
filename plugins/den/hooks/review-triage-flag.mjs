// SubagentStop half of the review-triage relay. A SubagentStop hook cannot
// write into the parent/orchestrator's context (its additionalContext goes to
// the subagent and loops it), so this half only records that a matched review
// agent finished, and emits NOTHING -- no continuation, no loop. The
// UserPromptSubmit half (review-triage-inject.mjs) does the actual injection.
//
// Concurrency: reviewers routinely finish simultaneously (parallel launches, a
// one-workflow review panel). So each completion drops its OWN file into a temp
// directory, keyed by the subagent's agent_id -- never a shared read-modify-
// write file, which would lose entries when two hooks race. Distinct filenames
// cannot collide. Matched to den:flag-reviewer in hooks.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = join(tmpdir(), "claude-review-triage");

// The agent type arrives bare from a user-level definition and plugin-scoped
// ("den:<name>" or "plugin_den_<name>") from the den plugin; compare the bare name.
const bareType = (t) => String(t ?? "").replace(/^(den:|plugin_den_)/, "");

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(data || "{}");
    // Filter here, not on the settings matcher: the SubagentStop matcher does
    // not reliably scope this hook (it fires for every subagent), so only a
    // matched reviewer type should leave a flag.
    if (bareType(input.agent_type) !== "flag-reviewer") {
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
