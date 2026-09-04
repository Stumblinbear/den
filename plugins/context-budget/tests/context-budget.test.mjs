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
import { stateFile } from "../hooks/session-record.mjs";
import {
  apiError,
  assistant,
  at,
  compactBoundary,
  COMPACT_SUMMARY,
  hhmm,
  HOUR,
  prompt,
  toolResult,
} from "./fixtures.mjs";

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
function session(t) {
  const id = `context-budget-test-${process.pid}-${seq++}`;
  const file = stateFile(id);
  t.after(() => rmSync(file, { force: true }));
  return {
    id,
    seed: (state) => writeFileSync(file, JSON.stringify(state)),
    record: () => JSON.parse(readFileSync(file, "utf8")),
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
  const text = injected(s.run(path)) ?? "";
  assert.match(text, /this session is at 200K tokens/);
  assert.match(text, /next natural stopping point/, "the notice message, not the urgent one");
  assert.equal(injected(s.run(path)), null, "the same level must not inject twice");
});

test("a compaction resets the level instead of measuring the pre-compact turn", (t) => {
  const s = session(t);
  s.seed({ level: "notice" });
  const path = transcript(assistant(260_000), compactBoundary(), COMPACT_SUMMARY);
  assert.equal(
    injected(s.run(path)),
    null,
    "the turn before the boundary is not this context; nothing may be injected",
  );
  // The level is back to `none`, so the rebuilt context announces itself from
  // `notice` again.
  assert.match(
    injected(s.run(transcript(assistant(200_000)))) ?? "",
    /next natural stopping point/,
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
  const s = session(t);
  s.seed({ level: "urgent" });
  assert.equal(injected(s.run(transcript(assistant(200_000)))), null, "a fall injects nothing");
  assert.match(
    injected(s.run(transcript(assistant(260_000)))) ?? "",
    /this session is at 260K tokens[\s\S]*Finish the step in hand/,
    "climbing past urgent again must inject the urgent message again",
  );
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
  const s = session(t);
  const fable = (tokens) => transcript(assistant(tokens, { model: "claude-fable-5-1" }));

  assert.equal(injected(s.run(fable(200_000))), null, "200K is under the fable row's 400K notice");
  assert.match(
    injected(s.run(fable(400_000))) ?? "",
    /this session is at 400K tokens/,
    "the fable row's notice fires at 400K",
  );
  assert.equal(injected(s.run(fable(650_000))), null, "650K is still under the fable row's 700K urgent");
  assert.match(
    injected(s.run(fable(700_000))) ?? "",
    /this session is at 700K tokens[\s\S]*Finish the step in hand/,
    "the fable row's urgent fires at 700K",
  );
});

// --- the cache snapshot in the injected message -----------------------------
//
// The recommendation the messages ask for is only worth making if the prompt it
// names still has a cached prefix behind it, so `{cache}` has to name prompts
// that do -- and to price what a cut at each of them would summarize and keep.

test("the notice passes over a prompt that opens the context and says so", (t) => {
  // A cut at the first prompt of the context summarizes nothing away, so it is
  // no use as a cut point however cheap it is. What the agent needs to hear in
  // that state is that there is nothing above the list to worry about at all.
  const s = session(t);
  const wired = at(20);
  const path = transcript(
    assistant(100_000, { minutesAgo: 45 }),
    prompt("Start on the cache-aware cut points now", at(40)),
    assistant(150_000, { minutesAgo: 39 }),
    prompt("Now wire the placeholder into both messages", wired),
    assistant(200_000, { minutesAgo: 19 }),
  );
  const text = injected(s.run(path)) ?? "";

  assert.match(
    text,
    new RegExp(
      `Cached prompts, oldest first:\\s+` +
        `1\\. "Now wire the placeholder into both messages"\\s+` +
        `sent ${hhmm(wired)} \\| valid until ${hhmm(wired, HOUR)} \\| ` +
        `150K tokens before it, keeps 50K`,
    ),
    "the expiry is one 1h lifetime after the prompt was sent",
  );
  assert.match(text, /Every prompt in the context is cached\./);
  assert.doesNotMatch(
    text,
    /Start on the cache-aware cut points now/,
    "the first prompt of the context is not a cut point",
  );
});

test("a failed request at the end of the transcript is not the current context", (t) => {
  // A request that never reached the model is written as an assistant entry
  // with every usage field zero. Read as the newest turn it says the context
  // is empty, and every cut point is then priced as keeping nothing -- on a
  // session the hook has just measured at 200K from the turn above it.
  const s = session(t);
  const path = transcript(
    assistant(100_000, { minutesAgo: 45 }),
    prompt("Start on the cache-aware cut points now", at(40)),
    prompt("Now wire the placeholder into both messages", at(20)),
    assistant(200_000, { minutesAgo: 19 }),
    apiError({ minutesAgo: 5 }),
  );
  const text = injected(s.run(path)) ?? "";

  assert.match(text, /this session is at 200K tokens/);
  assert.match(
    text,
    /"Now wire the placeholder into both messages"[\s\S]*?100K tokens before it, keeps 100K/,
    "what a cut there keeps is the 200K context less the 100K it summarizes away",
  );
});

test("the same transcript on a 5m lifetime has no cached prompt to name", (t) => {
  const s = session(t);
  const path = transcript(
    assistant(100_000, { minutesAgo: 45, ttl: "5m" }),
    prompt("Start on the cache-aware cut points now", at(40)),
    assistant(150_000, { minutesAgo: 39, ttl: "5m" }),
    prompt("Now wire the placeholder into both messages", at(20)),
    assistant(200_000, { minutesAgo: 19, ttl: "5m" }),
  );
  const text = injected(s.run(path)) ?? "";

  assert.match(text, /no prompt is still cached/);
  assert.match(text, /Recommend `\/compact <focus line>` instead/);
  assert.doesNotMatch(text, /Start on the cache-aware cut points now/);
});

test("a prompt older than the lifetime is passed over for the next one down", (t) => {
  const s = session(t);
  const path = transcript(
    assistant(100_000, { minutesAgo: 200 }),
    prompt("The stale prompt from hours ago", at(190)),
    assistant(150_000, { minutesAgo: 100 }),
    prompt("The oldest prompt still inside the window", at(30)),
    assistant(200_000, { minutesAgo: 29 }),
  );
  const text = injected(s.run(path)) ?? "";

  assert.match(
    text,
    /1\. "The oldest prompt still inside the window"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 150K tokens before it, keeps 50K/,
  );
  assert.doesNotMatch(text, /stale prompt/);
  assert.match(
    text,
    /every prompt before it is not, and a rewind there re-reads its whole prefix at full price/,
  );
});

test("user entries the rewind picker would not list are never named", (t) => {
  const s = session(t);
  const path = transcript(
    // Cold, and above everything else: it keeps the one prompt below from
    // being the first of the context, which would take it off the list on
    // grounds that have nothing to do with the picker.
    assistant(60_000, { minutesAgo: 200 }),
    prompt("The stale prompt from hours ago", at(190)),
    assistant(100_000, { minutesAgo: 50 }),
    toolResult("Reading the file the picker never offers", at(45)),
    prompt("A meta entry the harness wrote", at(44), { isMeta: true }),
    prompt("<task-notification>\n<task-id>abc</task-id>\n</task-notification>", at(43)),
    prompt("A relayed subagent report", at(42), {
      origin: { kind: "task-notification" },
    }),
    prompt("An entry shown in the transcript only", at(41), {
      isVisibleInTranscriptOnly: true,
    }),
    prompt("[Request interrupted by user]", at(40), {
      message: {
        role: "user",
        content: [{ type: "text", text: "[Request interrupted by user]" }],
      },
      interruptedMessageId: "msg_01",
    }),
    prompt("The one prompt the user actually typed", at(30)),
    assistant(200_000, { minutesAgo: 29 }),
  );
  const text = injected(s.run(path)) ?? "";

  assert.match(
    text,
    /1\. "The one prompt the user actually typed"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 100K tokens before it, keeps 100K/,
  );
  for (const ineligible of [
    /picker never offers/,
    /meta entry/,
    /task-notification/,
    /relayed subagent/,
    /transcript only/,
    /Request interrupted/,
  ]) {
    assert.doesNotMatch(text, ineligible);
  }
});

test("the scan crosses a compaction boundary only for the prompts it kept", (t) => {
  const s = session(t);
  const path = transcript(
    assistant(80_000, { minutesAgo: 60 }),
    prompt("A prompt the compaction summarized away", at(55)),
    assistant(100_000, { minutesAgo: 50 }),
    prompt("A prompt the compaction kept verbatim", at(45), { uuid: "kept-1" }),
    compactBoundary({ minutesAgo: 32, postTokens: 30_000, kept: ["kept-1"] }),
    COMPACT_SUMMARY,
    assistant(120_000, { minutesAgo: 30 }),
    prompt("The first prompt after the compaction", at(25)),
    assistant(200_000, { minutesAgo: 24 }),
  );
  const text = injected(s.run(path)) ?? "";

  assert.match(
    text,
    /The one prompt kept verbatim since then, from "A prompt the compaction kept verbatim" on/,
  );
  assert.match(
    text,
    /1\. "The first prompt after the compaction"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 120K tokens before it, keeps 80K/,
  );
  assert.doesNotMatch(
    text,
    /summarized away/,
    "a prompt the compaction did not keep is gone from the context and from the picker",
  );
});

test("a compaction boundary names the prompts it kept and the price of a rewind there", (t) => {
  // The compaction keeps a stretch of the conversation verbatim above its own
  // boundary, and the first request after it writes that whole stretch to the
  // cache. So a rewind at any of those prompts, or at anything since, costs at
  // most what the compaction left behind -- the opposite of the "nothing is
  // cached, use `/compact`" an empty prompt list otherwise reads as.
  const s = session(t);
  const compacted = at(20);
  const path = transcript(
    prompt("Read the brief and start on the scanner", at(120), { uuid: "kept-1" }),
    assistant(150_000, { minutesAgo: 119 }),
    prompt("Now add the skill that takes a fresh reading", at(100), { uuid: "kept-2" }),
    assistant(160_000, { minutesAgo: 99 }),
    compactBoundary({ minutesAgo: 20, postTokens: 48_631, kept: ["kept-1", "kept-2"] }),
    COMPACT_SUMMARY,
    assistant(200_000, { minutesAgo: 19 }),
  );
  const text = injected(s.run(path)) ?? "";

  assert.doesNotMatch(text, /no prompt is still cached/);
  assert.match(
    text,
    new RegExp(
      `The session was compacted at ${hhmm(compacted)} down to 48\\.6K tokens ` +
        `and nothing has been sent since\\. ` +
        `The 2 prompts kept verbatim, from "Read the brief and start on the scanner" on, ` +
        `can be rewound to for at most that price\\.`,
    ),
  );
});

test("a compaction that kept nothing leaves a context with one prompt and nothing to cut at", (t) => {
  // The boundary kept no prompt verbatim, so the only prompt in the context is
  // the first one sent after it -- and a cut there summarizes nothing away.
  // Saying what the compaction cost adds nothing to that choice, because there
  // is no choice; what the agent needs to hear is that there is nothing to cut
  // at yet, rather than a bare "every prompt in the context is cached" that
  // reads as an empty list.
  const s = session(t);
  const path = transcript(
    assistant(80_000, { minutesAgo: 60 }),
    prompt("A prompt the compaction summarized away", at(55)),
    assistant(100_000, { minutesAgo: 50 }),
    compactBoundary({ minutesAgo: 40, postTokens: 31_212, kept: [] }),
    COMPACT_SUMMARY,
    assistant(60_000, { minutesAgo: 39 }),
    prompt("The only prompt in the new context", at(35)),
    assistant(200_000, { minutesAgo: 34 }),
  );
  const text = injected(s.run(path)) ?? "";

  assert.doesNotMatch(text, /The session was compacted/);
  assert.match(
    text,
    /Prompt cache, read at \d\d:\d\d \(1h lifetime\)\. Every prompt in the context is cached; the only one is its first, so there is nothing to cut at yet\./,
  );
});
