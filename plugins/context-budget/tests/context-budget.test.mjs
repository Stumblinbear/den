// End-to-end tests for the hook: real process, real transcript file, real
// state file. Everything the hook reads is a file path or stdin, so there is
// nothing to stub -- and the bugs these cover (a stale measurement, a level
// that never re-arms) live in the interaction between those three, not in any
// one function.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "context-budget.mjs");
const DEFAULTS = join(ROOT, "hooks", "config.toml");
// The hook keeps its per-session level in the OS temp directory; tests use
// their own session ids there and delete only their own files.
const STATE_DIR = join(tmpdir(), "claude-context-budget");

const FIXTURES = mkdtempSync(join(tmpdir(), "context-budget-test-"));
process.on("exit", () => rmSync(FIXTURES, { recursive: true, force: true }));

// An assistant turn whose usage sums to `tokens`, the shape the hook measures.
const assistant = (tokens) =>
  JSON.stringify({
    type: "assistant",
    isSidechain: false,
    message: {
      model: "claude-fable-5-1",
      usage: {
        input_tokens: 1000,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: tokens - 2000,
      },
    },
  });

// What `/compact`, auto-compact and a rewind summarize all append: a boundary
// entry and a summary entry, with no assistant entry after them.
const COMPACT_BOUNDARY = JSON.stringify({
  type: "system",
  subtype: "compact_boundary",
  content: "Conversation compacted",
  level: "info",
  compactMetadata: { trigger: "manual", preTokens: 260000, postTokens: 11304 },
});
const COMPACT_SUMMARY = JSON.stringify({
  type: "user",
  isSidechain: false,
  isCompactSummary: true,
  message: { role: "user", content: "This session is being continued..." },
});

let seq = 0;
function transcript(...lines) {
  const path = join(FIXTURES, `transcript-${seq++}.jsonl`);
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

// One session per test, torn down with it, so tests cannot latch each other's
// level and cannot disturb a real session's file.
function session(t) {
  const id = `context-budget-test-${process.pid}-${seq++}`;
  const file = join(STATE_DIR, id + ".json");
  t.after(() => rmSync(file, { force: true }));
  return {
    id,
    seed: (state) => writeFileSync(file, JSON.stringify(state)),
    run: (transcriptPath) =>
      execFileSync(
        process.execPath,
        [HOOK, "--defaults", DEFAULTS, "--overrides", join(FIXTURES, "no-such-override.toml")],
        {
          input: JSON.stringify({
            session_id: id,
            transcript_path: transcriptPath,
            hook_event_name: "UserPromptSubmit",
          }),
          encoding: "utf8",
        },
      ),
  };
}

const injected = (stdout) =>
  stdout === "" ? null : JSON.parse(stdout).hookSpecificOutput.additionalContext;

test("injects once when the context first crosses notice", (t) => {
  const s = session(t);
  const path = transcript(assistant(200_000));
  assert.match(injected(s.run(path)) ?? "", /200K tokens, past the 150K notice threshold/);
  assert.equal(injected(s.run(path)), null, "the same level must not inject twice");
});

test("a compaction resets the record instead of measuring the pre-compact turn", (t) => {
  const s = session(t);
  s.seed({ level: "notice" });
  const path = transcript(assistant(260_000), COMPACT_BOUNDARY, COMPACT_SUMMARY);
  assert.equal(
    injected(s.run(path)),
    null,
    "the turn before the boundary is not this context; nothing may be injected",
  );
  // The record is gone, so the rebuilt context announces itself from `notice`.
  assert.match(injected(s.run(transcript(assistant(200_000)))) ?? "", /notice threshold/);
});

test("a compaction summary alone resets the record", (t) => {
  // Belt and braces for the same event: the record has to clear off the summary
  // entry alone, without the hook having to trust that every compaction path
  // writes a boundary entry first.
  const s = session(t);
  s.seed({ level: "notice" });
  const path = transcript(assistant(260_000), COMPACT_SUMMARY);
  assert.equal(injected(s.run(path)), null, "the summarized-away turn is not this context");
});

test("urgent re-arms after the context falls back to notice", (t) => {
  const s = session(t);
  s.seed({ level: "urgent" });
  assert.equal(injected(s.run(transcript(assistant(200_000)))), null, "a fall injects nothing");
  assert.match(
    injected(s.run(transcript(assistant(260_000)))) ?? "",
    /260K tokens, past the 250K urgent threshold/,
    "climbing past urgent again must inject again",
  );
});
