// PostToolUse and UserPromptSubmit hook. Measures how full the session's
// context is and injects one message when it crosses a per-model threshold, so
// the agent puts the choice between `/compact` and a rewind summarize to the
// user when the arc it is in ends.
//
// The message says the size and nothing else about the session: which prompt
// to cut at is the `context-budget:cut-point` skill's reading, taken when the
// agent is ready to act on it. So nothing here reads the transcript beyond the
// tail it measures, or a price at all.
//
// Subagents are out of scope, as they are short-lived and cannot compact.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import {
  configPaths,
  fill,
  formatTokens,
  loadConfig,
  modelRow,
  printedFault,
} from "../lib/config.mjs";
import { readRecord, writeRecord } from "../lib/session-record.mjs";
import {
  contextTokens,
  isCompaction,
  turnModel,
  turnUsage,
} from "../lib/transcript.mjs";

const EVENTS = ["PostToolUse", "UserPromptSubmit"];
// Enough to hold the newest assistant entry with room to spare: the largest
// line seen in a real transcript is ~100 KB, and an assistant entry is bounded
// by the model's output limit. A fixed tail keeps the cost of a hook that runs
// on every tool call independent of how long the session has grown.
const TAIL_BYTES = 512 * 1024;
const LEVELS = ["none", "notice", "urgent"];

// --- configuration ---------------------------------------------------------

const paths = configPaths(process.argv.slice(2));

// --- measurement -----------------------------------------------------------

function tail(path) {
  const fd = openSync(path, "r");

  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);

    if (buf.length > 0) {
      readSync(fd, buf, 0, buf.length, start);
    }

    // A tail that starts mid-file also starts mid-line: its first fragment is
    // not a whole entry, and may not even be whole UTF-8.
    return { text: buf.toString("utf8"), truncated: start > 0 };
  } finally {
    closeSync(fd);
  }
}

// The session's current context, from the newest assistant turn in the tail.
// Sidechain entries belong to a subagent sharing the transcript, so their usage
// is not the session's.
//
// A compaction entry reached before any assistant entry means the context was
// replaced: there is no assistant entry until the next turn, and the one above
// the boundary measures the context that was thrown away, so the scan reports
// an empty one instead.
function measure(path) {
  const { text, truncated } = tail(path);
  const lines = text.split("\n");

  for (let i = lines.length - 1; i >= (truncated ? 1 : 0); i--) {
    if (!lines[i]) {
      continue;
    }

    let entry;

    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    if (isCompaction(entry)) {
      return { model: "", tokens: 0 };
    }

    if (entry.type !== "assistant" || entry.isSidechain) {
      continue;
    }

    const usage = turnUsage(entry);

    if (!usage) {
      continue;
    }

    return { model: turnModel(entry), tokens: contextTokens(usage) };
  }

  return null;
}

// --- output ----------------------------------------------------------------

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => void run());

async function run() {
  try {
    const input = JSON.parse(data || "{}");

    if (input.agent_id) {
      process.exit(0);
    }

    const event = String(input.hook_event_name ?? "");

    if (!EVENTS.includes(event)) {
      process.exit(0);
    }

    if (!input.transcript_path || !input.session_id || !paths.defaultsPath) {
      process.exit(0);
    }

    // Before any work, so a broken install or a broken config is reported on
    // the session's first hook run rather than whenever the first threshold
    // happens to be crossed.
    const config = await loadConfig(input.session_id, paths);

    const measured = measure(String(input.transcript_path));

    if (!measured) {
      process.exit(0);
    }

    // The reading goes into the session's record on every run, injected or
    // not: the cut-point script is handed a session id and nothing else, and
    // the record is where it finds the transcript.
    //
    // Two instances of this hook fired for tool calls running in parallel can
    // both read the old level and both inject on the first crossing: an
    // accepted race, since the worst case is the same reminder twice in one
    // turn.
    const stored = readRecord(input.session_id);
    const posted = LEVELS.includes(stored.level) ? stored.level : "none";

    // A row switched off for this model injects nothing and so posts nothing:
    // the level stands where it was, and the reading is recorded all the same.
    const row = modelRow(config, measured.model);
    const limits = row.enabled === false ? null : row;

    const level = !limits
      ? posted
      : measured.tokens >= limits.urgent
        ? "urgent"
        : measured.tokens >= limits.notice
          ? "notice"
          : "none";

    // Only a rise injects, but a fall is still recorded, so `level` tracks the
    // context rather than the highest point the session ever reached: a
    // summarize that takes `urgent` back down to `notice` has to leave `urgent`
    // able to fire again on the next climb, and a fall to `none` -- what a
    // compact produces -- starts the climb over.
    const rise = LEVELS.indexOf(level) > LEVELS.indexOf(posted);

    writeRecord(input.session_id, {
      level,
      model: measured.model,
      tokens: measured.tokens,
      transcript_path: String(input.transcript_path),
      at: new Date().toISOString(),
    });

    if (!rise) {
      process.exit(0);
    }

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: fill(config.section("messages")[level], {
            model: measured.model || "this model",
            tokens: formatTokens(measured.tokens),
            threshold: formatTokens(limits[level]),
          }),
        },
      }),
    );
  } catch (error) {
    // A config fault `loadConfig` has just printed: exit 1 is what puts that
    // line in front of the user. Everything else -- a broken transcript, a
    // full temp directory -- must never stall a tool call or a prompt.
    if (printedFault(error)) {
      process.exit(1);
    }
  }

  process.exit(0);
}
