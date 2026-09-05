// The failure policy both hooks share: no quiet recovery. A parser that will
// not import, or a configuration that cannot be read, parsed, or used, is
// reported once for the session -- by whichever hook hits it first -- and
// after that every hook in that session does nothing at all, silently.
//
// These run the real processes, because the whole contract is out-of-band: an
// exit code, one line on stderr, and one per-session file shared across two
// hooks.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { STATE_DIR, stateFile } from "../lib/session-record.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HOOKS = join(ROOT, "hooks");
const LIB = join(ROOT, "lib");
const DEFAULTS = join(HOOKS, "config.toml");

const FIXTURES = mkdtempSync(join(tmpdir(), "config-errors-test-"));
process.on("exit", () => rmSync(FIXTURES, { recursive: true, force: true }));

let seq = 0;

// A per-test session id, with the state it leaves behind removed with it.
function sessionId(t) {
  const id = `config-errors-test-${process.pid}-${seq++}`;
  t.after(() => rmSync(stateFile(id), { force: true }));
  return id;
}

// Everything this session has left in the state directory: one file, the
// record, whatever it reported along the way.
const stateFiles = (id) =>
  readdirSync(STATE_DIR).filter((name) => name.startsWith(id + "."));

// The hooks copied where smol-toml cannot be imported: the stub package
// resolves to a file that is not there, so the import throws wherever the copy
// is run from, which is the `parser` class. `hooks/` and `lib/` go along under
// their own names, since a hook that cannot resolve one of its own imports
// fails with a stack trace rather than the report under test. Returns the
// copied `hooks/`, which is where the two entry points are.
function withoutParser() {
  const dir = join(FIXTURES, `no-parser-${seq++}`);
  mkdirSync(join(dir, "node_modules", "smol-toml"), { recursive: true });
  writeFileSync(
    join(dir, "node_modules", "smol-toml", "package.json"),
    JSON.stringify({ name: "smol-toml", version: "0.0.0", main: "index.js" }),
  );
  for (const from of [HOOKS, LIB]) {
    const to = join(dir, basename(from));
    mkdirSync(to);
    for (const file of readdirSync(from).filter((f) => f.endsWith(".mjs"))) {
      cpSync(join(from, file), join(to, file));
    }
  }
  return join(dir, basename(HOOKS));
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
        model: "claude-opus-5",
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

// --- one file per session ---------------------------------------------------

test("a reported fault leaves the session one state file, the record itself", (t) => {
  const id = sessionId(t);
  const transcript = mainTranscript();
  const over = overrides("[default]\nnotice = \n");

  reported(measure(HOOKS, id, transcript, over), "config");
  quiet(measure(HOOKS, id, transcript, over));

  assert.deepEqual(
    stateFiles(id),
    [basename(stateFile(id))],
    "the fault class is recorded in the session record, not in a file of its own",
  );
});

test("both fault classes are reported once each and still share the one file", (t) => {
  const id = sessionId(t);
  const noParser = withoutParser();
  const guardPath = guardTranscript();
  const transcript = mainTranscript();
  const broken = overrides("[default]\nnotice = \n");
  const fine = overrides();

  reported(guard(noParser, id, guardPath, fine), "parser");
  reported(measure(HOOKS, id, transcript, broken), "config");

  quiet(guard(noParser, id, guardPath, fine));
  quiet(measure(HOOKS, id, transcript, broken));

  assert.deepEqual(stateFiles(id), [basename(stateFile(id))]);
});

test("recording a fault keeps the reading the record already held", (t) => {
  const id = sessionId(t);
  const transcript = mainTranscript();
  const over = overrides("[default]\nnotice = 150000\n");

  assert.notEqual(measure(HOOKS, id, transcript, over).stdout, "", "the run measures");

  writeFileSync(over, "[default]\nnotice = \n");
  reported(measure(HOOKS, id, transcript, over), "config");

  assert.deepEqual(stateFiles(id), [basename(stateFile(id))]);

  const record = JSON.parse(readFileSync(stateFile(id), "utf8"));

  assert.equal(record.transcript_path, transcript, "the transcript path survives");
  assert.equal(record.level, "notice", "so does the level already posted");
});
