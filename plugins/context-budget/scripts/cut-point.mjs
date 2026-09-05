// The `context-budget:cut-point` skill's preamble command: a current reading of
// which rewind cut points are still free in the session it runs in.
//
// This is the only place a cut point is named: a prompt named in the message
// the measurement hook injects is named before the agent is ready to act on
// it, and may be out of the cache by the time it is. The messages say how
// large the session is and send the agent here.
//
// All it adds to the reading itself is finding the transcript to read and the
// rate to price it at, both of which the skill's preamble hands it:
// `--pricing` and `--pricing-overrides` for the price table, and the session
// id from the environment for the transcript.
//
// Prints to stdout and always exits 0: its output is read as prose by the
// agent, so an explanation of why there is no list is more use than a stack
// trace.
import { existsSync } from "node:fs";
import { pathArgs } from "../lib/args.mjs";
import { cacheReading } from "../lib/cache-reading.mjs";
import { loadPricing, pricingPaths } from "../lib/pricing.mjs";
import { scanCacheWindow } from "../lib/prompt-cache.mjs";
import { readRecord } from "../lib/session-record.mjs";

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
