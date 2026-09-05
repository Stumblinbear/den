// End-to-end tests for the cut-point script: a real process, run the way the
// skill's preamble runs it. What it has to get right is finding the transcript
// -- it is handed a session id through the environment and nothing else -- and
// pricing what it finds against the shipped price table, and saying something
// useful when it can do neither, since its output is read as prose by an agent
// that has no other way to tell what went wrong.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  MINUTE,
  prompt,
} from "./fixtures.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "cut-point.mjs");
const HOOK = join(ROOT, "hooks", "context-budget.mjs");
const DEFAULTS = join(ROOT, "hooks", "config.toml");
const PRICING = join(ROOT, "hooks", "pricing.toml");

const FIXTURES = mkdtempSync(join(tmpdir(), "cut-point-test-"));
process.on("exit", () => rmSync(FIXTURES, { recursive: true, force: true }));

let seq = 0;
function transcript(...lines) {
  const path = join(FIXTURES, `transcript-${seq++}.jsonl`);
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

// A pricing override file, or a path to one that is not there -- the normal
// case, since almost nobody corrects a published price.
function pricingOverride(toml) {
  const path = join(FIXTURES, `pricing-override-${seq++}.toml`);
  if (toml !== undefined) writeFileSync(path, toml);
  return path;
}

// The script the way the skill's preamble runs it: both pricing paths on the
// command line, and the session id from its own environment, which is what
// that shell hands over.
const spawn = (args, env = {}, overridePath = pricingOverride()) =>
  spawnSync(
    process.execPath,
    [SCRIPT, ...args, "--pricing", PRICING, "--pricing-overrides", overridePath],
    {
      encoding: "utf8",
      env: { ...process.env, CLAUDE_CODE_SESSION_ID: "", ...env },
    },
  );

// The reading alone, from a run that had nothing to report.
function run(args, env = {}) {
  const result = spawn(args, env);

  assert.equal(result.stderr, "", "nothing to report on a shipped price table");
  assert.equal(result.status, 0, "the reading is prose, so the exit is always 0");

  return result.stdout;
}

// A session id nothing else will collide with, and its record, removed with
// the test that made it. The record is the measurement hook's, so the test
// gets one the way a real session does -- by running the hook. Writing the
// file by hand here would let the two drift, and the script reading a shape
// the hook had stopped writing is exactly the failure these tests exist for.
function session(t) {
  const id = `cut-point-test-${process.pid}-${seq++}`;
  t.after(() => rmSync(stateFile(id), { force: true }));
  return {
    id,
    measure: (transcriptPath) =>
      execFileSync(
        process.execPath,
        [
          HOOK,
          "--defaults",
          DEFAULTS,
          "--overrides",
          join(FIXTURES, "no-such-override.toml"),
          "--pricing",
          PRICING,
          "--pricing-overrides",
          pricingOverride(),
        ],
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

const opened = at(50);
const started = at(35);

// Two cached prompts an hour apart from expiry, with a cold one above them.
const SESSION_TRANSCRIPT = () =>
  transcript(
    assistant(80_000, { minutesAgo: 200 }),
    prompt("The prompt from before lunch", at(190)),
    assistant(100_000, { minutesAgo: 55 }),
    prompt("Read the brief and start on the scanner", opened),
    assistant(150_000, { minutesAgo: 40 }),
    prompt("Now add the skill that takes a fresh reading", started),
    assistant(200_000, { minutesAgo: 30 }),
  );

test("lists the cached cut points oldest first, with what each one summarizes and keeps", () => {
  const out = run(["--transcript", SESSION_TRANSCRIPT()]);

  // Read by hand from a path, and priced from that path all the same: the
  // transcript's own turns name the model, so nothing is being assumed and the
  // opening line has no rate to disclose.
  assert.match(
    out,
    /Prompt cache, read at \d\d:\d\d \(1h lifetime\)\. Cached prompts, oldest first:/,
  );
  assert.match(
    out,
    new RegExp(
      `1\\. "Read the brief and start on the scanner"\\s+` +
        `sent ${hhmm(opened)} \\| valid until ${hhmm(opened, HOUR)} \\| 100K tokens before it, keeps 100K, pays back after 22 turns\\s+` +
        `2\\. "Now add the skill that takes a fresh reading"\\s+` +
        `sent ${hhmm(started)} \\| valid until ${hhmm(started, HOUR)} \\| 150K tokens before it, keeps 50K, pays back after 9 turns`,
    ),
    "the context is 200K, so what a cut keeps is 200K less what it summarizes",
  );
  assert.doesNotMatch(out, /before lunch/, "the cold prompt above them is not a cut point");
  assert.match(out, /every prompt before it is not, and a rewind there re-reads its whole prefix at full price/);
});

test("a prompt that opens the context is left off the list", () => {
  // A cut at the first prompt of the context summarizes nothing away, so it
  // prices a rewind nobody would ask for. The entries below it are a different
  // matter: each has the prompts above it to be cut at instead, and its size is
  // what choosing it summarizes away rather than them.
  const out = run([
    "--transcript",
    transcript(
      assistant(100_000, { minutesAgo: 55 }),
      prompt("Read the brief and start on the scanner", at(50)),
      assistant(150_000, { minutesAgo: 40 }),
      prompt("Now add the skill that takes a fresh reading", started),
      assistant(200_000, { minutesAgo: 30 }),
    ),
  ]);

  assert.match(
    out,
    new RegExp(
      `1\\. "Now add the skill that takes a fresh reading"\\s+` +
        `sent ${hhmm(started)} \\| valid until ${hhmm(started, HOUR)} \\| 150K tokens before it, keeps 50K, pays back after 9 turns`,
    ),
  );
  assert.doesNotMatch(out, /Read the brief and start on the scanner/);
  assert.match(out, /Every prompt in the context is cached\./);
});

test("the list is three prompts spread across the cached context, not across the clock", () => {
  // A busy stretch: five prompts, all in the cache. Listing every one of them
  // is a page of rows that say the same thing, and the three that are worth
  // choosing between are the ones that cut the context in different places --
  // which is not where they fall in the hour. Prompt 3 is the middle by size
  // and prompt 2 is the middle by clock.
  const out = run([
    "--transcript",
    transcript(
      assistant(50_000, { minutesAgo: 200 }),
      prompt("The stale prompt from before lunch", at(190)),
      assistant(100_000, { minutesAgo: 50 }),
      ...[
        [45, 101_000],
        [41, 102_000],
        [37, 140_000],
        [33, 180_000],
      ].flatMap(([minutesAgo, tokens], i) => [
        prompt(`Prompt number ${i}`, at(minutesAgo)),
        assistant(tokens, { minutesAgo: minutesAgo - 1 }),
      ]),
      prompt("Prompt number 4", at(29)),
      assistant(200_000, { minutesAgo: 28 }),
    ),
  ]);

  assert.deepEqual(
    [...out.matchAll(/"Prompt number (\d)"/g)].map((m) => m[1]),
    ["0", "3", "4"],
    "the oldest, the one closest to halfway between their prefixes, and the newest",
  );
  assert.match(
    out,
    /"Prompt number 3"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 140K tokens before it, keeps 60K, pays back after 11 turns/,
  );
  assert.match(out, /Every prompt after the first is cached too;/);
});

test("finds the transcript from the session id in the environment", (t) => {
  const s = session(t);
  const path = SESSION_TRANSCRIPT();
  s.measure(path);

  // Everything but the first line, which carries the clock and would differ
  // between two runs that straddle a minute.
  const list = (out) => out.split("\n").slice(1).join("\n");

  assert.equal(
    list(run([], { CLAUDE_CODE_SESSION_ID: s.id })),
    list(run(["--transcript", path])),
    "the record the hook wrote points at the same transcript",
  );
});

test("a session the hook has never measured is reported, not guessed at", (t) => {
  const s = session(t);
  const out = run([], { CLAUDE_CODE_SESSION_ID: s.id });

  assert.match(out, /^No measurement recorded for this session/);
  assert.match(out, /--transcript/, "the agent is told how to get the list anyway");
});

test("no session id in the environment reads the same way as no record", () => {
  assert.match(run([]), /^No measurement recorded for this session/);
});

test("a compaction boundary names the prompts it kept and the price of a rewind there", () => {
  // No prompt has been sent since the compaction, so the cached list is empty
  // on a context the session has just finished compacting. What is true in that
  // state is not "nothing is cached, use `/compact`": the compaction kept a
  // stretch of prompts verbatim above its own boundary, and a rewind at any of
  // them costs at most what it left behind.
  const compacted = at(20);
  const out = run([
    "--transcript",
    transcript(
      prompt("Read the brief and start on the scanner", at(120), { uuid: "kept-1" }),
      assistant(150_000, { minutesAgo: 119 }),
      prompt("Now add the skill that takes a fresh reading", at(100), { uuid: "kept-2" }),
      assistant(160_000, { minutesAgo: 99 }),
      compactBoundary({ minutesAgo: 20, postTokens: 48_631, kept: ["kept-1", "kept-2"] }),
      COMPACT_SUMMARY,
      assistant(200_000, { minutesAgo: 19 }),
    ),
  ]);

  assert.doesNotMatch(out, /no prompt is still cached/);
  assert.match(
    out,
    new RegExp(
      `The session was compacted at ${hhmm(compacted)} down to 48\\.6K tokens ` +
        `and nothing has been sent since\\. ` +
        `The 2 prompts kept verbatim, from "Read the brief and start on the scanner" on, ` +
        `can be rewound to for at most that price\\.`,
    ),
  );
});

test("a reading with no payback figure in it discloses no rate", () => {
  // Compacted, and nothing sent since: the walk meets no assistant turn, so
  // the transcript names no model and the reading falls back to the default
  // rate. There is nothing here priced at that rate -- no prompt is cached, so
  // no payback figure is printed -- and a rate disclosed over a passage that
  // quotes no number reads as a fact about the compaction it stands next to.
  const out = run([
    "--transcript",
    transcript(
      prompt("Read the brief and start on the scanner", at(120), { uuid: "kept-1" }),
      assistant(150_000, { minutesAgo: 119 }),
      compactBoundary({ minutesAgo: 20, postTokens: 48_631, kept: ["kept-1"] }),
      COMPACT_SUMMARY,
    ),
  ]);

  assert.doesNotMatch(out, /cache read/, "no payback figure, so no rate to disclose");
  assert.match(
    out,
    /^Prompt cache, read at \d\d:\d\d \(5m lifetime\)\./,
    "no turn wrote the cache, so the lifetime is the API default",
  );
  assert.match(
    out,
    /The session was compacted at \d\d:\d\d down to 48\.6K tokens and nothing has been sent since\./,
  );
});

test("the `/compact` command's own entry is never offered as a cut point", () => {
  // The harness writes the `/compact` user entry *after* the boundary it
  // caused and stamps it from before it, so the scan reads it as the first
  // prompt of the new context. A rewind there lands on a context whose first
  // message is the compaction summary, which is what the session had just
  // finished doing.
  const out = run([
    "--transcript",
    transcript(
      prompt("The prompt the compaction kept verbatim", at(120), { uuid: "kept-1" }),
      assistant(150_000, { minutesAgo: 119 }),
      compactBoundary({ minutesAgo: 40, postTokens: 31_212, kept: ["kept-1"] }),
      COMPACT_SUMMARY,
      prompt(
        "<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args></command-args>",
        at(41),
      ),
      assistant(60_000, { minutesAgo: 39 }),
      prompt("Ordinary prompt one", at(35)),
      assistant(100_000, { minutesAgo: 34 }),
      prompt("Ordinary prompt two", at(30)),
      assistant(140_000, { minutesAgo: 29 }),
    ),
  ]);

  assert.doesNotMatch(out, /"\/compact"|command-name/);
  assert.match(
    out,
    /1\. "Ordinary prompt one"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 60K tokens before it, keeps 80K, pays back after 30 turns/,
  );
  assert.match(
    out,
    /2\. "Ordinary prompt two"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 100K tokens before it, keeps 40K, pays back after 11 turns/,
  );
});

test("a failed request is not the turn the prompt below it is priced against", () => {
  // A request that never reached the model is written as an assistant entry
  // all the same, with every usage field zero. It carried no context and wrote
  // no cache entry, so the prompt below it is priced against the turn above
  // it -- the last one that really ran -- and reading the failure as a turn
  // prices that cut at nothing at all.
  const wired = at(20);
  const out = run([
    "--transcript",
    transcript(
      assistant(100_000, { minutesAgo: 45 }),
      prompt("Read the brief and start on the scanner", at(40)),
      apiError({ minutesAgo: 39 }),
      prompt("Now add the skill that takes a fresh reading", wired),
      assistant(200_000, { minutesAgo: 19 }),
    ),
  ]);

  assert.match(
    out,
    new RegExp(
      `1\\. "Now add the skill that takes a fresh reading"\\s+` +
        `sent ${hhmm(wired)} \\| valid until ${hhmm(wired, HOUR)} \\| ` +
        `100K tokens before it, keeps 100K, pays back after 22 turns`,
    ),
    "the 100K turn wrote the prefix a cut there re-reads, and the context is 200K",
  );
});

test("a prefix behind a turn that wrote nothing lives as long as the turn that wrote it", () => {
  // A request served entirely from the cache writes nothing back to it: the
  // entry the prompt below it would be rewound to was written by an older
  // request, and a read refreshes an entry without changing how long it lives.
  // So the lifetime is that older request's, which is not the session's
  // current one if the setting changed since.
  const cold = run([
    "--transcript",
    transcript(
      assistant(100_000, { minutesAgo: 45, ttl: "5m" }),
      prompt("Read the brief and start on the scanner", at(40)),
      assistant(150_000, { minutesAgo: 39, ttl: null }),
      prompt("Now add the skill that takes a fresh reading", at(20)),
      assistant(200_000, { minutesAgo: 19, ttl: "1h" }),
    ),
  ]);

  assert.match(
    cold,
    /no prompt is still cached/,
    "its prefix was written under 5m, 39 minutes ago, so it is not cached at all",
  );
  assert.doesNotMatch(cold, /Now add the skill/);

  // The same session while that prompt is still inside the 5m its prefix was
  // written under: cached, and it says so until then rather than for an hour.
  const sent = at(2);
  const warm = run([
    "--transcript",
    transcript(
      assistant(100_000, { minutesAgo: 45, ttl: "5m" }),
      prompt("Read the brief and start on the scanner", at(40)),
      assistant(150_000, { minutesAgo: 39, ttl: null }),
      prompt("Now add the skill that takes a fresh reading", sent),
      assistant(200_000, { minutesAgo: 1, ttl: "1h" }),
    ),
  ]);

  assert.match(
    warm,
    new RegExp(
      `1\\. "Now add the skill that takes a fresh reading"\\s+` +
        `sent ${hhmm(sent)} \\| valid until ${hhmm(sent, 5 * MINUTE)} \\| ` +
        `150K tokens before it, keeps 50K, pays back after 9 turns`,
    ),
  );
});

test("a session with nothing cached left points at `/compact` instead", () => {
  const out = run([
    "--transcript",
    transcript(
      assistant(100_000, { minutesAgo: 55, ttl: "5m" }),
      prompt("Read the brief and start on the scanner", at(50)),
      assistant(200_000, { minutesAgo: 30, ttl: "5m" }),
    ),
  ]);

  assert.match(out, /Prompt cache, read at.*5m lifetime/);
  assert.match(out, /no prompt is still cached/);
  assert.match(out, /Recommend `\/compact <focus line>` instead\./);
});

// --- what a cut costs and when it has paid for itself -----------------------
//
// A rewind is not free: the first request after it writes everything the cut
// kept back to the cache, at twice a fresh input token on the one-hour
// lifetime where carrying on would have read that same stretch at the read
// rate, and only then starts saving the read of what it summarized away, once
// per turn. So the same cut is worth taking in a session with forty turns left
// in it and not in one with four -- and on the tier that reads at a quarter of
// the usual price it takes about four times as long to come good.

// Nine turns, with two prompts priced against different points in them: the
// older keeps most of the context and pays back slowly, the newer keeps little
// and pays back quickly.
const PAYBACK_TRANSCRIPT = (model) =>
  transcript(
    assistant(80_000, { minutesAgo: 200, model }),
    prompt("The prompt from before lunch", at(190)),
    assistant(110_000, { minutesAgo: 41, model }),
    prompt("Read the brief and start on the scanner", at(40)),
    assistant(120_000, { minutesAgo: 39, model }),
    assistant(140_000, { minutesAgo: 38, model }),
    assistant(160_000, { minutesAgo: 37, model }),
    prompt("Now add the skill that takes a fresh reading", at(36)),
    assistant(180_000, { minutesAgo: 35, model }),
    assistant(190_000, { minutesAgo: 34, model }),
    assistant(195_000, { minutesAgo: 33, model }),
    assistant(198_000, { minutesAgo: 32, model }),
    assistant(200_000, { minutesAgo: 31, model }),
  );

test("each cut point carries the turns it takes to pay back", (t) => {
  // (2 - 0.1) x 90K to write back what carrying on would have read, plus
  // 0.1 x 110K read on the way past, plus 20K for the summary, against
  // 0.1 x 110K saved on every turn after it: 19 turns.
  const s = session(t);
  s.measure(PAYBACK_TRANSCRIPT("claude-opus-5"));

  const out = run([], { CLAUDE_CODE_SESSION_ID: s.id });

  assert.match(
    out,
    /1\. "Read the brief and start on the scanner"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 110K tokens before it, keeps 90K, pays back after 19 turns/,
  );
  assert.match(
    out,
    /2\. "Now add the skill that takes a fresh reading"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 160K tokens before it, keeps 40K, pays back after 7 turns/,
    "a cut that keeps less costs less to write back and comes good sooner",
  );
  assert.doesNotMatch(
    out,
    /default 0\.1x cache read/,
    "the record names the model, so the rate is that model's row and not a guess",
  );
});

test("the same cut points on Fable take about four times as long to pay back", (t) => {
  // The identical transcript under the id the `fable` row matches. That tier
  // reads a cached token at 0.025 against 0.1, so every turn saves a quarter
  // as much -- and the write back costs a shade more, since the read it
  // replaces was cheaper too.
  const s = session(t);
  s.measure(PAYBACK_TRANSCRIPT("claude-fable-5-1"));

  const out = run([], { CLAUDE_CODE_SESSION_ID: s.id });

  assert.match(
    out,
    /1\. "Read the brief and start on the scanner"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 110K tokens before it, keeps 90K, pays back after 73 turns/,
  );
  assert.match(
    out,
    /2\. "Now add the skill that takes a fresh reading"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 160K tokens before it, keeps 40K, pays back after 26 turns/,
  );
});

test("the transcript being read names the model, not the session running the read", (t) => {
  // `--transcript` is how a session reads a transcript that is not its own,
  // and the record beside it belongs to the reader rather than to what is
  // being read. Pricing off the record would put this Fable transcript on the
  // reader's Opus rate and understate every cut point by a factor of four.
  const s = session(t);
  s.measure(PAYBACK_TRANSCRIPT("claude-opus-5"));

  const out = run(["--transcript", PAYBACK_TRANSCRIPT("claude-fable-5-1")], {
    CLAUDE_CODE_SESSION_ID: s.id,
  });

  assert.match(out, /keeps 90K, pays back after 73 turns/, "Fable's rate, not the reader's");
  assert.match(out, /keeps 40K, pays back after 26 turns/);
  assert.doesNotMatch(out, /cache read\)/, "there is a model, so no rate is assumed");
});

test("a transcript that names no model says which rate it fell back to", () => {
  // Every turn in it carries an empty model id, which matches no row. The
  // reading is still worth printing -- but a payback figure is only worth as
  // much as the rate behind it, and on the one tier that reads at a quarter of
  // the usual price it would be out by a factor of four, so the rate it
  // settled for goes in the opening line.
  const out = run([
    "--transcript",
    transcript(
      assistant(110_000, { minutesAgo: 41, model: "" }),
      prompt("Read the brief and start on the scanner", at(40)),
      prompt("Now add the skill that takes a fresh reading", at(36)),
      assistant(200_000, { minutesAgo: 35, model: "" }),
    ),
  ]);

  assert.match(
    out,
    /Prompt cache, read at \d\d:\d\d \(1h lifetime, payback at the default 0\.1x cache read\)\./,
  );
  assert.match(out, /keeps 90K, pays back after 19 turns/);
});

test("a cut on the five-minute lifetime writes back at the cheaper rate", (t) => {
  // The write back is 1.25 fresh tokens on the five-minute lifetime against 2
  // on the hour, and it is the lifetime in force now that prices it: the
  // rewind's own write happens now, whatever the prefix it re-reads was
  // written under. (1.25 - 0.1) x 50K + 0.1 x 150K + 20K over 0.1 x 150K is
  // 7 turns; at the hour's rate it would be 9.
  const s = session(t);
  s.measure(
    transcript(
      assistant(100_000, { minutesAgo: 20, ttl: "5m" }),
      prompt("A prompt from a while ago", at(19)),
      assistant(150_000, { minutesAgo: 4, ttl: "5m" }),
      prompt("The prompt still inside the five minutes", at(3)),
      assistant(200_000, { minutesAgo: 2, ttl: "5m" }),
    ),
  );

  assert.match(
    run([], { CLAUDE_CODE_SESSION_ID: s.id }),
    /1\. "The prompt still inside the five minutes"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 150K tokens before it, keeps 50K, pays back after 7 turns/,
  );
});

// --- the price table --------------------------------------------------------
//
// What a cached token costs is a fact about the model, published by whoever
// runs it, so it ships as its own file and the user file beside it is a
// correction to a price that has moved. Getting that file wrong must not cost
// the session its reading, only the accuracy of one number in it.

test("a user price table replaces the rate the payback is figured at", (t) => {
  // The same session as the two above, on a table that halves what the model
  // is said to charge for a cached read. Half the saving per turn is nearly
  // twice as long before the write back has been earned: 19 turns becomes 37
  // and 7 becomes 14.
  const s = session(t);
  s.measure(PAYBACK_TRANSCRIPT("claude-opus-5"));

  const out = spawn(
    [],
    { CLAUDE_CODE_SESSION_ID: s.id },
    pricingOverride("default = 0.05\n"),
  );

  assert.equal(out.stderr, "", "a usable override is not a fault");
  assert.match(
    out.stdout,
    /1\. "Read the brief and start on the scanner"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 110K tokens before it, keeps 90K, pays back after 37 turns/,
  );
  assert.match(
    out.stdout,
    /2\. "Now add the skill that takes a fresh reading"\s+sent \d\d:\d\d \| valid until \d\d:\d\d \| 160K tokens before it, keeps 40K, pays back after 14 turns/,
  );
});

test("a row the shipped table has no key for is tried after the ones it has", (t) => {
  // `'claude-'` matches every id there is, Fable's included, so where it is
  // tried decides both readings. Behind the shipped rows -- which is where a
  // key the shipped file does not have goes -- it prices Opus and leaves Fable
  // on the row that was written for it; in front of them it would quietly take
  // the exception away.
  const opus = session(t);
  const fable = session(t);
  opus.measure(PAYBACK_TRANSCRIPT("claude-opus-5"));
  fable.measure(PAYBACK_TRANSCRIPT("claude-fable-5-1"));

  const over = pricingOverride("[models]\n'claude-' = 0.5\n");

  assert.match(
    spawn([], { CLAUDE_CODE_SESSION_ID: opus.id }, over).stdout,
    /keeps 90K, pays back after 4 turns/,
    "no shipped row matches Opus, so the added one does",
  );
  assert.match(
    spawn([], { CLAUDE_CODE_SESSION_ID: fable.id }, over).stdout,
    /keeps 90K, pays back after 73 turns/,
    "the shipped `fable` row is tried first and still wins",
  );
});

test("a price the API cannot charge is dropped whole and the shipped rates stand", (t) => {
  // 5 would price a cached token at five fresh ones and read as a cut paying
  // for itself in a turn or two. The file goes, the reading stays -- at the
  // rates the plugin ships, and the same figures the two tests above assert.
  const s = session(t);
  s.measure(PAYBACK_TRANSCRIPT("claude-opus-5"));

  const out = spawn([], { CLAUDE_CODE_SESSION_ID: s.id }, pricingOverride("default = 5\n"));

  assert.equal(out.status, 0, "a price it cannot use is not a reason to say nothing");
  assert.equal(out.stderr, "");
  assert.match(out.stdout, /keeps 90K, pays back after 19 turns/);
});

test("a hand run with no session id leaves no record behind", () => {
  // Checking an override by hand is the documented way to see what it does,
  // and a shell that Claude Code did not start has no session id. Nothing here
  // has anything to write against one: a state file named after the empty
  // string would be shared by every hand run on the machine, in any project,
  // on any day.
  const stray = stateFile("");
  rmSync(stray, { force: true });

  const out = spawn(
    ["--transcript", SESSION_TRANSCRIPT()],
    {},
    pricingOverride("default = 5\n"),
  );

  assert.equal(out.stderr, "");
  assert.match(out.stdout, /pays back after/, "the reading is printed all the same");
  assert.equal(existsSync(stray), false, `no session id is no record to write: ${stray}`);
});

test("a transcript that names no model takes the table's default, not a row that matches it", () => {
  // An empty model id is not a model a row can be written for: it is a
  // transcript that says nothing about what it was sent to. A row keyed to
  // match anything -- '.*', '^', '' -- would otherwise take an empty id as a
  // match and price the reading at a rate the opening line then calls the
  // default.
  const out = spawn(
    [
      "--transcript",
      transcript(
        assistant(110_000, { minutesAgo: 41, model: "" }),
        prompt("Read the brief and start on the scanner", at(40)),
        prompt("Now add the skill that takes a fresh reading", at(36)),
        assistant(200_000, { minutesAgo: 35, model: "" }),
      ),
    ],
    {},
    pricingOverride("[models]\n'.*' = 0.5\n"),
  );

  assert.equal(out.stderr, "", "a row keyed to match anything is a usable table");
  assert.match(
    out.stdout,
    /Prompt cache, read at \d\d:\d\d \(1h lifetime, payback at the default 0\.1x cache read\)\./,
  );
  assert.match(out.stdout, /keeps 90K, pays back after 19 turns/);
});
