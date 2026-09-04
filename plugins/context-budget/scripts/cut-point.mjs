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
// finding the transcript to read.
//
// Prints to stdout and always exits 0: its output is read as prose by the
// agent, so an explanation of why there is no list is more use than a stack
// trace.
import { existsSync } from "node:fs";
import { cacheReading } from "../hooks/cache-reading.mjs";
import { scanCacheWindow } from "../hooks/prompt-cache.mjs";
import { readRecord } from "../hooks/session-record.mjs";

// --- finding the transcript -------------------------------------------------

function parseArgs(args) {
  let transcript = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--transcript") transcript = args[++i];
  }

  return { transcript };
}

// The record the measurement hook writes, which carries the transcript path it
// read. It writes one on every run, so any session this plugin is loaded in
// has one from its first tool call onwards -- and a session with none is one
// the hook has never measured, which no amount of guessing at file names can
// turn into a reading of the right transcript.
function recordedTranscript(session) {
  const path = readRecord(session).transcript_path;

  return path && existsSync(path) ? path : null;
}

// --- entry point ------------------------------------------------------------

const { transcript } = parseArgs(process.argv.slice(2));
const session = process.env.CLAUDE_CODE_SESSION_ID ?? "";
const path = transcript ?? (session && recordedTranscript(session));

if (!path) {
  process.stdout.write(
    "No measurement recorded for this session: the context-budget hook is not running here, or CLAUDE_CODE_SESSION_ID is unset. Pass `--transcript <path to the session's .jsonl>` to read one directly.\n",
  );
  process.exit(0);
}

try {
  process.stdout.write(cacheReading(scanCacheWindow(path)) + "\n");
} catch (error) {
  process.stdout.write(
    `The transcript at ${path} could not be read (${error?.code ?? error?.message}), so the cache window is unknown.\n`,
  );
}
