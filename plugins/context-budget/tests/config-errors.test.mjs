// The failure policy both hooks share: no quiet recovery. A parser that will
// not import, or a configuration that cannot be read, parsed, or used, is
// reported once for the session -- by whichever hook hits it first -- and
// after that every hook in that session does nothing at all, silently.
//
// These run the real processes, because the whole contract is out-of-band: an
// exit code, one line on stderr, and a marker file shared across two hooks.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HOOKS = join(ROOT, "hooks");
const DEFAULTS = join(HOOKS, "config.toml");
const STATE_DIR = join(tmpdir(), "claude-context-budget");

const FIXTURES = mkdtempSync(join(tmpdir(), "config-errors-test-"));
process.on("exit", () => rmSync(FIXTURES, { recursive: true, force: true }));

let seq = 0;

// A per-test session id, with whichever once-per-session error markers it
// leaves behind removed with it.
function sessionId(t) {
  const id = `config-errors-test-${process.pid}-${seq++}`;
  t.after(() => {
    rmSync(join(STATE_DIR, id + ".json"), { force: true });
    for (const cls of ["parser", "config"]) {
      rmSync(join(STATE_DIR, `${id}.${cls}`), { force: true });
    }
  });
  return id;
}

// The hooks copied where smol-toml cannot be imported: the stub package
// resolves to a file that is not there, so the import throws wherever the copy
// is run from, which is the `parser` class.
function withoutParser() {
  const dir = join(FIXTURES, `no-parser-${seq++}`);
  mkdirSync(join(dir, "node_modules", "smol-toml"), { recursive: true });
  writeFileSync(
    join(dir, "node_modules", "smol-toml", "package.json"),
    JSON.stringify({ name: "smol-toml", version: "0.0.0", main: "index.js" }),
  );
  for (const file of ["config.mjs", "context-budget.mjs", "resume-guard.mjs"]) {
    cpSync(join(HOOKS, file), join(dir, file));
  }
  return dir;
}

function overrides(toml) {
  const path = join(FIXTURES, `override-${seq++}.toml`);
  if (toml !== undefined) writeFileSync(path, toml);
  return path;
}

// A session transcript with one 200K assistant turn -- past the shipped notice
// threshold, so a working measurement hook would inject.
function mainTranscript() {
  const path = join(FIXTURES, `main-${seq++}.jsonl`);
  writeFileSync(
    path,
    JSON.stringify({
      type: "assistant",
      isSidechain: false,
      message: {
        model: "claude-fable-5-1",
        usage: {
          input_tokens: 1000,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 198_000,
        },
      },
    }) + "\n",
  );
  return path;
}

// A session transcript with a subagent beside it whose context is past the
// shipped `large` limit, so a working guard would deny resuming it.
function guardTranscript() {
  const dir = join(FIXTURES, `guard-${seq++}`);
  const subagents = join(dir, "main", "subagents");
  mkdirSync(subagents, { recursive: true });
  const path = join(dir, "main.jsonl");
  writeFileSync(path, JSON.stringify({ type: "user", message: { role: "user", content: "go" } }) + "\n");
  writeFileSync(
    join(subagents, "agent-big.jsonl"),
    JSON.stringify({
      type: "assistant",
      timestamp: new Date().toISOString(),
      message: {
        usage: {
          input_tokens: 1000,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 160_300,
        },
      },
    }) + "\n",
  );
  return path;
}

const spawn = (hook, overridePath, input) =>
  spawnSync(process.execPath, [hook, "--defaults", DEFAULTS, "--overrides", overridePath], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });

const guard = (dir, session, transcript, overridePath) =>
  spawn(join(dir, "resume-guard.mjs"), overridePath, {
    hook_event_name: "PreToolUse",
    tool_name: "SendMessage",
    session_id: session,
    tool_input: { to: "big" },
    transcript_path: transcript,
  });

const measure = (dir, session, transcript, overridePath) =>
  spawn(join(dir, "context-budget.mjs"), overridePath, {
    hook_event_name: "UserPromptSubmit",
    session_id: session,
    transcript_path: transcript,
  });

// The report: exit 1 so the user sees it, one line, naming the class.
function reported(result, cls) {
  assert.equal(result.status, 1, "a reported fault exits 1 so Claude Code shows the line");
  assert.equal(result.stdout, "", "a hook that is reporting must not also act");
  assert.match(result.stderr, new RegExp(`^context-budget: ${cls} error `));
  assert.equal(result.stderr.split("\n").filter(Boolean).length, 1, "the report is one line");
  return result.stderr;
}

// Silent and inert: the session has already been told.
function quiet(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "");
}

test("the guard reports a missing parser once, then goes quiet, and never denies", (t) => {
  const dir = withoutParser();
  const id = sessionId(t);
  const transcript = guardTranscript();
  const over = overrides();
  assert.match(reported(guard(dir, id, transcript, over), "parser"), /smol-toml/);
  quiet(guard(dir, id, transcript, over));
});

test("the guard reports a malformed override once, then goes quiet, and never denies", (t) => {
  const id = sessionId(t);
  const transcript = guardTranscript();
  const over = overrides("[resume-guard\nlarge = 10\n");
  assert.ok(reported(guard(HOOKS, id, transcript, over), "config").includes(over), over);
  quiet(guard(HOOKS, id, transcript, over));
});

test("the measurement hook reports a malformed override once, then injects nothing", (t) => {
  const id = sessionId(t);
  const transcript = mainTranscript();
  const over = overrides("[default]\nnotice = \n");
  assert.ok(reported(measure(HOOKS, id, transcript, over), "config").includes(over), over);
  quiet(measure(HOOKS, id, transcript, over));
});

test("a config fault reported by the guard silences the measurement hook too", (t) => {
  const id = sessionId(t);
  const over = overrides("[resume-guard\nlarge = 10\n");
  reported(guard(HOOKS, id, guardTranscript(), over), "config");
  quiet(measure(HOOKS, id, mainTranscript(), over));
});

test("a blank deny message is a config fault, not an empty deny reason", (t) => {
  const id = sessionId(t);
  const transcript = guardTranscript();
  const over = overrides('[resume-guard.messages]\ndenied = ""\n');
  reported(guard(HOOKS, id, transcript, over), "config");
  quiet(guard(HOOKS, id, transcript, over));
});
