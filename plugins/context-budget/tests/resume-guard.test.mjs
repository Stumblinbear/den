// End-to-end tests for the resume guard: real process, real transcript files,
// real config files. What they cover is the wiring between the three -- that
// the guard reads its limits and its deny wording from the config it is handed,
// and that an override replacing one key leaves the rest of the section
// shipped.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { apiError } from "./fixtures.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "resume-guard.mjs");
const DEFAULTS = join(ROOT, "hooks", "config.toml");
// Where the guard marks an approval consumed; tests use their own answer ids
// there and delete only their own markers.
const CONSUMED_DIR = join(tmpdir(), "claude-resume-guard");

const FIXTURES = mkdtempSync(join(tmpdir(), "resume-guard-test-"));
process.on("exit", () => rmSync(FIXTURES, { recursive: true, force: true }));

let seq = 0;

// One turn of the subagent's own transcript: `tokens` of context, taken
// `minutesAgo` ago, billed under the `ttl` cache-creation split. `null` is a
// request that wrote nothing to the cache -- both splits zero -- which says
// nothing about the lifetime in force.
const turn = (tokens, minutesAgo, ttl = "5m") =>
  JSON.stringify({
    type: "assistant",
    timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    message: {
      usage: {
        input_tokens: 1000,
        cache_creation_input_tokens: ttl ? 1000 : 0,
        cache_read_input_tokens: ttl ? tokens - 2000 : tokens - 1000,
        cache_creation: {
          ephemeral_1h_input_tokens: ttl === "1h" ? 1000 : 0,
          ephemeral_5m_input_tokens: ttl === "5m" ? 1000 : 0,
        },
      },
    },
  });

// A session transcript with the subagent transcript the guard reads beside it,
// at the path Claude Code writes: <transcript without .jsonl>/subagents/
// agent-<name>.jsonl. `turns` are the subagent's, oldest first; `entries` are
// the main transcript's lines.
function build(name, turns, entries) {
  const dir = join(FIXTURES, `session-${seq++}`);
  const subagents = join(dir, "main", "subagents");
  mkdirSync(subagents, { recursive: true });
  const transcript = join(dir, "main.jsonl");
  writeFileSync(transcript, entries.join("\n") + "\n");
  writeFileSync(join(subagents, `agent-${name}.jsonl`), turns.join("\n") + "\n");
  return transcript;
}

// One turn, just taken: well inside the 5m cache TTL, so only the `large`
// limit is in play.
const session = (name, tokens, ...entries) =>
  build(name, [turn(tokens, 0)], entries);

// The same, with the subagent's last turn `ageMin` minutes in the past. Past
// the 5m TTL its cache is cold, which is what brings the `cold` limit into
// play.
const aged = (name, tokens, ageMin, ...entries) =>
  build(name, [turn(tokens, ageMin)], entries);

const PROMPT = JSON.stringify({ type: "user", message: { role: "user", content: "carry on" } });

// The user's answer to an AskUserQuestion, as it lands in the transcript: one
// answer approves one resume, and the guard remembers the entry's uuid.
const answer = (uuid) =>
  JSON.stringify({
    type: "user",
    uuid,
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          content: 'Your questions have been answered: "Resume big?"="Resume"',
        },
      ],
    },
  });

// Writes `toml` as the override file and returns its path; no argument means a
// path that does not exist, which is the shipped-config-only case.
function overrides(toml) {
  const path = join(FIXTURES, `override-${seq++}.toml`);
  if (toml !== undefined) writeFileSync(path, toml);
  return path;
}

function run(transcript, to, toml) {
  const stdout = execFileSync(
    process.execPath,
    [HOOK, "--defaults", DEFAULTS, "--overrides", overrides(toml)],
    {
      input: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "SendMessage",
        tool_input: { to },
        transcript_path: transcript,
      }),
      encoding: "utf8",
    },
  );
  return stdout === "" ? null : JSON.parse(stdout).hookSpecificOutput;
}

const reason = (output) => {
  assert.equal(output?.permissionDecision, "deny", "the call should have been denied");
  return output.permissionDecisionReason;
};

test("denies a resume above the shipped large limit, and `enabled = false` allows it", () => {
  const transcript = session("big", 162_300, PROMPT);
  assert.match(
    reason(run(transcript, "big")),
    /Resume of subagent big: context 162\.3K tokens is above the 150K resume limit/,
  );
  assert.equal(
    run(transcript, "big", "[resume-guard]\nenabled = false\n"),
    null,
    "a disabled guard must allow the same call",
  );
});

test("an override limit below the subagent's context turns an allowed resume into a deny", () => {
  // 100K is under the shipped 150K, and the subagent's cache is warm, so
  // nothing in the shipped config applies to it.
  const transcript = session("medium", 100_000, PROMPT);
  assert.equal(run(transcript, "medium"), null, "the shipped limits leave this resume alone");
  assert.match(
    reason(run(transcript, "medium", "[resume-guard]\nlarge = 50_000\n")),
    /context 100K tokens is above the 50K resume limit/,
  );
});

test("an override replaces one deny message and leaves the other shipped", (t) => {
  const uuid = `resume-guard-test-${process.pid}-${seq++}`;
  t.after(() => rmSync(join(CONSUMED_DIR, uuid), { force: true }));
  const transcript = session("big", 162_300, PROMPT, answer(uuid));
  const toml = '[resume-guard.messages]\ndenied = "Fresh launch instead of {agent}."\n';

  // The answer approves one resume: the first call is allowed and consumes it,
  // and the second falls to `used`, which the override did not touch.
  assert.equal(run(transcript, "big", toml), null, "the user's answer approves one resume");
  assert.match(
    reason(run(transcript, "big", toml)),
    /^Resume of subagent big: .*already been used for one resume of this agent/,
    "the shipped `used` message must survive an override of `denied`",
  );

  // With the answer spent, a transcript that carries none reaches `denied`.
  assert.equal(
    reason(run(session("big", 162_300, PROMPT), "big", toml)),
    "Fresh launch instead of big.",
  );
});

test("denies a cold resume above the shipped cold limit, and an override raises that limit", () => {
  // 60K is under the shipped 150K `large`, so the expired 5m cache is the only
  // thing that puts this resume past a limit at all.
  const transcript = aged("napping", 60_000, 10, PROMPT);
  assert.match(
    reason(run(transcript, "napping")),
    /last active 10 min ago, 5m cache expired: cold full-price replay of 60K tokens/,
  );
  const raised = "[resume-guard]\ncold = 80_000\n";
  assert.equal(
    run(transcript, "napping", raised),
    null,
    "a cold limit above the subagent's context leaves the resume alone",
  );
  // The override set `cold` alone, so `large` is still the shipped 150K.
  assert.match(
    reason(run(aged("napping", 162_300, 10, PROMPT), "napping", raised)),
    /context 162\.3K tokens is above the 150K resume limit/,
  );
});

test("a last turn that wrote nothing to the cache takes its lifetime from the turn that did", () => {
  // A request served entirely from a warm cache writes nothing back to it, so
  // both its cache-creation splits are zero and it says nothing about the
  // lifetime in force. Reading that silence as 5m makes every subagent whose
  // last turn was a cache hit look cold minutes after it stopped, and refuses
  // a resume whose cache in fact has most of an hour left.
  const transcript = build(
    "dozing",
    [turn(60_000, 90, "1h"), turn(60_000, 20, null)],
    [PROMPT],
  );

  assert.equal(
    run(transcript, "dozing"),
    null,
    "20 minutes into the 1h lifetime that turn wrote under, and 60K is under `large`",
  );
});

test("a request that failed is not the subagent's last turn", () => {
  // A subagent whose newest entry is a failed request has a usage with every
  // field zero, which measures its context at nothing and lets any resume
  // through -- including the one this guard exists for, where every turn from
  // here on re-reads 162.3K tokens.
  const transcript = build(
    "stalled",
    [turn(162_300, 3, "1h"), apiError({ minutesAgo: 1 })],
    [PROMPT],
  );

  assert.match(
    reason(run(transcript, "stalled")),
    /context 162\.3K tokens is above the 150K resume limit/,
  );
});

test("the cache age is measured from the last turn, not from the turn that wrote the cache", () => {
  // The lifetime comes from the writing turn; how long ago the subagent
  // stopped does not. Its cache was refreshed by every turn since, so the one
  // that matters is the newest.
  const transcript = build(
    "dozed-off",
    [turn(60_000, 200, "1h"), turn(60_000, 70, null)],
    [PROMPT],
  );

  assert.match(
    reason(run(transcript, "dozed-off")),
    /last active 70 min ago, 1h cache expired: cold full-price replay of 60K tokens/,
  );
});
