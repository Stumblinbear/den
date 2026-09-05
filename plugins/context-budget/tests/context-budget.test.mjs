// End-to-end tests for the hook: real process, real transcript file, real
// state file. Everything the hook reads is a file path or stdin, so there is
// nothing to stub -- and the bugs these cover (a stale measurement, a level
// that never re-arms) live in the interaction between those three, not in any
// one function.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { stateFile } from "../lib/session-record.mjs";
import { apiError, assistant, compactBoundary, COMPACT_SUMMARY } from "./fixtures.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "context-budget.mjs");
const DEFAULTS = join(ROOT, "hooks", "config.toml");

const FIXTURES = mkdtempSync(join(tmpdir(), "context-budget-test-"));
process.on("exit", () => rmSync(FIXTURES, { recursive: true, force: true }));

let seq = 0;
function transcript(...lines) {
  const path = join(FIXTURES, `transcript-${seq++}.jsonl`);
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

// One session per test, torn down with it, so tests cannot latch each other's
// level and cannot disturb a real session's file. The record lives in the OS
// temp directory under a name the hook's own module spells, so a test cannot
// watch the wrong file.
// `config` is the user's own override file where a test needs one; without it
// the hook is pointed at a path that is not there, which is what almost every
// session really has.
function session(t, { config } = {}) {
  const id = `context-budget-test-${process.pid}-${seq++}`;
  const file = stateFile(id);
  t.after(() => rmSync(file, { force: true }));

  const overrides = () => {
    if (config === undefined) return join(FIXTURES, "no-such-override.toml");

    const path = join(FIXTURES, `override-${seq++}.toml`);
    writeFileSync(path, config);
    return path;
  };

  const argv = [HOOK, "--defaults", DEFAULTS, "--overrides", overrides()];

  const options = (transcriptPath) => ({
    input: JSON.stringify({
      session_id: id,
      transcript_path: transcriptPath,
      hook_event_name: "UserPromptSubmit",
    }),
    encoding: "utf8",
  });

  return {
    id,
    seed: (state) => writeFileSync(file, JSON.stringify(state)),
    record: () => JSON.parse(readFileSync(file, "utf8")),
    run: (transcriptPath) =>
      execFileSync(process.execPath, argv, options(transcriptPath)),
  };
}

const injected = (stdout) =>
  stdout === "" ? null : JSON.parse(stdout).hookSpecificOutput.additionalContext;

// What a test recognises an injection by, in place of the shipped wording: a
// message naming its own level, with `{tokens}` between two markers. A session
// handed `MESSAGES` injects these instead of the shipped pair, so an assertion
// on the text says which level fired and what it measured without any test
// here holding a word of `config.toml` -- and the markers on both ends leave
// nowhere for anything riding along to hide. Sessions that only ever assert
// nothing was injected are left on the shipped messages, which is what a real
// session has.
const marked = (level, tokens) => `<${level}> ${tokens} </${level}>`;

const MESSAGES = `[messages]
notice = "${marked("notice", "{tokens}")}"
urgent = "${marked("urgent", "{tokens}")}"
`;

test("injects once when the context first crosses notice", (t) => {
  const s = session(t, { config: MESSAGES });
  const path = transcript(assistant(200_000));
  assert.equal(
    injected(s.run(path)),
    marked("notice", "200K"),
    "the notice message, not the urgent one",
  );
  assert.equal(injected(s.run(path)), null, "the same level must not inject twice");
});

test("a compaction resets the level instead of measuring the pre-compact turn", (t) => {
  const s = session(t, { config: MESSAGES });
  s.seed({ level: "notice" });
  const path = transcript(assistant(260_000), compactBoundary(), COMPACT_SUMMARY);
  assert.equal(
    injected(s.run(path)),
    null,
    "the turn before the boundary is not this context; nothing may be injected",
  );
  // The level is back to `none`, so the rebuilt context announces itself from
  // `notice` again.
  assert.equal(
    injected(s.run(transcript(assistant(200_000)))),
    marked("notice", "200K"),
  );
});

test("a compaction summary alone resets the level", (t) => {
  // Belt and braces for the same event: the level has to fall off the summary
  // entry alone, without the hook having to trust that every compaction path
  // writes a boundary entry first.
  const s = session(t);
  s.seed({ level: "notice" });
  const path = transcript(assistant(260_000), COMPACT_SUMMARY);
  assert.equal(injected(s.run(path)), null, "the summarized-away turn is not this context");
});

test("urgent re-arms after the context falls back to notice", (t) => {
  const s = session(t, { config: MESSAGES });
  s.seed({ level: "urgent" });
  assert.equal(injected(s.run(transcript(assistant(200_000)))), null, "a fall injects nothing");
  assert.equal(
    injected(s.run(transcript(assistant(260_000)))),
    marked("urgent", "260K"),
    "climbing past urgent again must inject the urgent message again",
  );
});

test("a failed request at the end of the transcript is not the current context", (t) => {
  // A request that never reached the model is written as an assistant entry
  // with every usage field zero. Read as the newest turn it says the context
  // is empty, and a session that has just been measured at 200K crosses
  // nothing, falls back to `none`, and announces itself all over again on the
  // next real turn.
  const s = session(t, { config: MESSAGES });
  const path = transcript(
    assistant(200_000, { minutesAgo: 19 }),
    apiError({ minutesAgo: 5 }),
  );

  assert.equal(injected(s.run(path)), marked("notice", "200K"));
  assert.equal(s.record().tokens, 200_000, "the turn above the failure is the context");
});

// --- the session record -----------------------------------------------------
//
// The cut-point script is handed a session id and nothing else, and the record
// is the only thing that turns that into a transcript path. It is written on
// every run for exactly that reason: a session where nothing has ever been
// injected is the common case, and the skill is invokable in it.

test("a run below every threshold still records the reading", (t) => {
  const s = session(t);
  const path = transcript(assistant(50_000));

  assert.equal(injected(s.run(path)), null, "50K is under the shipped 150K notice");

  const record = s.record();

  assert.equal(record.transcript_path, path, "the path the script has to find");
  assert.equal(record.level, "none", "nothing has been posted");
  assert.equal(record.model, "claude-opus-5");
  assert.equal(record.tokens, 50_000);
  assert.ok(Date.parse(record.at) > 0, `\`at\` is a timestamp, got ${record.at}`);
});

test("a model whose row is switched off is recorded but never injected for", (t) => {
  // Haiku ships disabled, so nothing is measured against a threshold for it at
  // all -- and the session still needs a transcript path the skill can read.
  const s = session(t);
  const path = transcript(
    assistant(260_000, { model: "claude-haiku-4-5-20251001" }),
  );

  assert.equal(injected(s.run(path)), null, "a switched-off row injects nothing");

  const record = s.record();

  assert.equal(record.transcript_path, path);
  assert.equal(record.tokens, 260_000);
  assert.equal(record.level, "none", "a row that cannot inject cannot post a level");
});

test("the shipped fable row raises both thresholds for that model", (t) => {
  // A row key that stopped matching the id the transcript records would hand
  // Fable the 150K default without a word, so the row is checked by the id.
  const s = session(t, { config: MESSAGES });
  const fable = (tokens) => transcript(assistant(tokens, { model: "claude-fable-5-1" }));

  assert.equal(injected(s.run(fable(200_000))), null, "200K is under the fable row's 400K notice");
  assert.equal(
    injected(s.run(fable(400_000))),
    marked("notice", "400K"),
    "the fable row's notice fires at 400K",
  );
  assert.equal(injected(s.run(fable(650_000))), null, "650K is still under the fable row's 700K urgent");
  assert.equal(
    injected(s.run(fable(700_000))),
    marked("urgent", "700K"),
    "the fable row's urgent fires at 700K",
  );
});

test("a transcript that names no model takes [default], not a row that matches it", (t) => {
  // An empty model id is a transcript that says nothing about what it was sent
  // to, and no row was written for that. A row keyed to match everything --
  // '.*', '^', '' -- would otherwise take it and fire on thresholds nobody
  // chose for it, which on a row like this one is an urgent notice at a
  // context that is not large.
  const rows = "[models.'.*']\nnotice = 10_000\nurgent = 20_000\n" + MESSAGES;

  const unnamed = session(t, { config: rows });

  assert.equal(
    injected(unnamed.run(transcript(assistant(120_000, { model: "" })))),
    null,
    "120K is under [default]'s 150K notice, and [default] is what governs it",
  );
  assert.equal(unnamed.record().level, "none");

  // The same row against an id there is one for: still tried, still wins, so
  // the rule is about the empty id and not about the row.
  const named = session(t, { config: rows });

  assert.equal(
    injected(named.run(transcript(assistant(120_000, { model: "claude-opus-5" })))),
    marked("urgent", "120K"),
    "a row keyed to match everything still governs a model that has an id",
  );
});

// --- what a crossing injects ------------------------------------------------
//
// What the hook owes the message is the measurement substituted into it and
// nothing else: the configured text goes out whole, with nothing of the hook's
// own around it -- no cut point, no reading of the cache. Every assertion above
// recognises a level by its marked message; these two say what the markers are
// there to prove, on a measurement that is not a round number.

test("crossing notice injects the configured notice, filled and on its own", (t) => {
  const s = session(t, { config: MESSAGES });

  assert.equal(
    injected(s.run(transcript(assistant(200_400)))),
    marked("notice", "200.4K"),
  );
});

test("crossing urgent injects the configured urgent message, filled and on its own", (t) => {
  const s = session(t, { config: MESSAGES });

  assert.equal(
    injected(s.run(transcript(assistant(260_400)))),
    marked("urgent", "260.4K"),
  );
});
