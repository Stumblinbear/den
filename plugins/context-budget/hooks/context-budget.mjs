// PostToolUse and UserPromptSubmit hook. Measures how full the session's
// context is and injects one message when it crosses a per-model threshold, so
// the agent finishes its task and then recommends `/compact` or a rewind
// summarize.
//
// Subagents are out of scope, as they are short-lived and cannot compact.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { cacheSnapshot } from "./cache-reading.mjs";
import { configPaths, fill, formatTokens, loadConfig } from "./config.mjs";
import { readRecord, writeRecord } from "./session-record.mjs";
import { contextTokens, isCompaction, turnUsage } from "./transcript.mjs";

const EVENTS = ["PostToolUse", "UserPromptSubmit"];
// Enough to hold the newest assistant entry with room to spare: the largest
// line seen in a real transcript is ~100 KB, and an assistant entry is bounded
// by the model's output limit. A fixed tail keeps the cost of a hook that runs
// on every tool call independent of how long the session has grown.
const TAIL_BYTES = 512 * 1024;
const LEVELS = ["none", "notice", "urgent"];

// --- configuration ---------------------------------------------------------

const paths = configPaths(process.argv.slice(2));

// The three sections this hook reads, each merged key by key with the user's
// override: an override row with the same regex replaces the shipped one, and a
// new row is appended after them, so it is matched last.
const sections = (file) => ({
  models: file.section("models"),
  default: file.section("default"),
  messages: file.section("messages"),
});

// First row whose key, read as a regular expression, matches the model id, and
// `default` when none do. Every row here is one config.mjs has already checked,
// so a match is a usable answer.
function getThresholds(config, model) {
  for (const [pattern, row] of [
    ...Object.entries(config.models),
    [null, config.default],
  ]) {
    if (pattern !== null && !new RegExp(pattern).test(model)) {
      continue;
    }

    if (row.enabled === false) {
      return null;
    }

    return row;
  }

  return null;
}

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

    return { model: String(entry.message?.model ?? ""), tokens: contextTokens(usage) };
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
    const config = sections(await loadConfig(input.session_id, paths));

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

    // A row switched off for this model, which injects nothing and so posts
    // nothing: the level stands where it was, and the reading is recorded all
    // the same.
    const limits = getThresholds(config, measured.model);

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
          additionalContext: fill(config.messages[level], {
            model: measured.model || "this model",
            tokens: formatTokens(measured.tokens),
            threshold: formatTokens(limits[level]),
            // Only here, on the one run in the session that injects this
            // level. The per-tool-call path that measures and stays quiet
            // keeps its fixed-size tail read and never walks the transcript.
            cache: cacheSnapshot(String(input.transcript_path)),
          }),
        },
      }),
    );
  } catch {
    // A broken transcript or a full temp directory must never stall a tool
    // call or a prompt.
  }

  process.exit(0);
}
