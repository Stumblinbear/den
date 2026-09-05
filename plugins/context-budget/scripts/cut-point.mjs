// The `context-budget:cut-point` skill's preamble command: a current reading of
// which rewind cut points are still free in the session it runs in.
//
// The measurement hook bakes one of these into the message it injects, but that
// snapshot ages -- the agent is told to finish its task first, and by the time
// it raises the recommendation the prompt it was going to name may have fallen
// out of the cache. This is how it gets another one.
//
// The reading is the hook's own, printed as it injects it, so the two cannot
// tell the agent different things about the same session. All this adds is
// finding the transcript to read and the rate to price it at -- it takes the
// same `--pricing` and `--pricing-overrides` the measurement hook takes, so a
// payback figure it prints is the one the hook would have printed.
//
// Prints to stdout and always exits 0: its output is read as prose by the
// agent, so an explanation of why there is no list is more use than a stack
// trace.
import { existsSync } from "node:fs";
import { pathArgs } from "../hooks/args.mjs";
import { cacheReading } from "../hooks/cache-reading.mjs";
import { loadPricing, pricingPaths } from "../hooks/pricing.mjs";
import { scanCacheWindow } from "../hooks/prompt-cache.mjs";
import { readRecord } from "../hooks/session-record.mjs";

// --- finding the transcript -------------------------------------------------

// The transcript path the record carries. The measurement hook writes one on
// every run, so any session this plugin is loaded in has a record from its
// first tool call onwards -- and a session with none is one the hook has never
// measured, which no amount of guessing at file names can turn into a reading
// of the right transcript.
function recordedTranscript(record) {
  const path = record.transcript_path;

  return path && existsSync(path) ? path : null;
}

// --- entry point ------------------------------------------------------------

const args = process.argv.slice(2);
const { transcript } = pathArgs(args, { "--transcript": "transcript" });
const prices = pricingPaths(args);
const session = process.env.CLAUDE_CODE_SESSION_ID ?? "";
const record = session ? readRecord(session) : {};
const path = transcript ?? recordedTranscript(record);

if (!path) {
  process.stdout.write(
    "No measurement recorded for this session: the context-budget hook is not running here, or CLAUDE_CODE_SESSION_ID is unset. Pass `--transcript <path to the session's .jsonl>` to read one directly.\n",
  );
  process.exit(0);
}

// The model priced against comes out of the transcript being read, not out of
// the record: `--transcript` is how one session reads another's, and the
// record belongs to the reader.
const pricing = await loadPricing(prices);

try {
  process.stdout.write(cacheReading(scanCacheWindow(path), pricing) + "\n");
} catch (error) {
  process.stdout.write(
    `The transcript at ${path} could not be read (${error?.code ?? error?.message}), so the cache window is unknown.\n`,
  );
}
