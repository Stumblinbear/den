// PostToolUse and UserPromptSubmit hook. Measures how full the session's
// context is and injects one message when it crosses a per-model threshold, so
// the agent finishes its task and then recommends `/compact` or a rewind
// summarize -- before auto-compact fires and picks the cut point itself.
//
// The hook input carries no model id and no context usage, so both come from
// the transcript: the last non-sidechain assistant entry's `message.model` and
// the sum of `input_tokens`, `cache_creation_input_tokens` and
// `cache_read_input_tokens` on its `message.usage`. That format is internal and
// unstable, so every read is best-effort -- anything unparseable, missing, or
// unexpected means this hook emits nothing rather than guessing.
//
// Thresholds and message text come from a TOML file passed in as --defaults
// (the shipped copy under ${CLAUDE_PLUGIN_ROOT}, replaced on every update) with
// an optional --overrides file merged over it key by key (under
// ${CLAUDE_PLUGIN_DATA}, which survives updates). Both variables also reach
// this process in the environment; taking the paths as arguments instead keeps
// the script runnable by hand against an arbitrary config. A parser that will
// not import or a configuration this hook cannot use is reported once for the
// session by hooks/config.mjs, which then stops the run: a dead notice the user
// was told about beats one that is silently dead.
//
// Each level injects once per session. The level reached is recorded in the OS
// temp directory -- never in the project and never in the data directory, since
// it is worthless the moment the session ends -- and follows the measurement
// back down, so a level that has fallen can fire again on the next climb.
//
// A compact or a summarize therefore needs no PostCompact hook: the entries it
// appends end the backward scan, and the empty measurement that produces
// clears the record.
//
// Subagents are out of scope (they are short-lived and cannot compact), so an
// input carrying `agent_id` is skipped. Never blocks a tool or a prompt.
import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { configPaths, fill, formatTokens, loadConfig, STATE_DIR } from "./config.mjs";

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
//
// `enabled = false` on the matching row returns nothing at all, which switches
// the plugin off for that model: the row wins the match, so no later row and
// not `default` applies, and the caller injects nothing and records nothing.
function thresholds(config, model) {
  for (const [pattern, row] of [...Object.entries(config.models), [null, config.default]]) {
    if (pattern !== null && !new RegExp(pattern).test(model)) continue;
    if (row.enabled === false) return null;
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
    if (buf.length > 0) readSync(fd, buf, 0, buf.length, start);
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
// replaced. `/compact`, auto-compact and both rewind summarize directions each
// append a `compact_boundary` system entry followed by an `isCompactSummary`
// user entry, and no assistant entry until the next turn. Either one ends the
// scan, so a path that writes only the summary is covered without having to
// know which paths write a boundary. The assistant entry above them measures
// the context that was thrown away, so the scan reports an empty one instead.
function measure(path) {
  const { text, truncated } = tail(path);
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= (truncated ? 1 : 0); i--) {
    if (!lines[i]) continue;
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (
      (entry.type === "system" && entry.subtype === "compact_boundary") ||
      (entry.type === "user" && entry.isCompactSummary === true)
    ) {
      return { model: "", tokens: 0 };
    }
    if (entry.type !== "assistant" || entry.isSidechain) continue;
    const usage = entry.message?.usage;
    if (!usage) continue;
    const tokens =
      (usage.input_tokens || 0) +
      (usage.cache_creation_input_tokens || 0) +
      (usage.cache_read_input_tokens || 0);
    if (tokens <= 0) continue;
    return { model: String(entry.message?.model ?? ""), tokens };
  }
  return null;
}

// --- level state -----------------------------------------------------------

const stateFile = (sessionId) =>
  join(STATE_DIR, String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_") + ".json");

// One file per session, read-modify-written by whichever run is going. Two
// PostToolUse instances fired for tool calls running in parallel can both read
// the old level and both inject on the first crossing: an accepted race, since
// the worst case is the same reminder twice in one turn.
function readState(file) {
  try {
    const state = JSON.parse(readFileSync(file, "utf8"));
    return state && typeof state === "object" ? state : {};
  } catch {
    return {};
  }
}

function writeState(file, fields) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(fields));
}

// --- output ----------------------------------------------------------------

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => void run());

async function run() {
  try {
    const input = JSON.parse(data || "{}");
    if (input.agent_id) process.exit(0);
    const event = String(input.hook_event_name ?? "");
    if (!EVENTS.includes(event)) process.exit(0);
    if (!input.transcript_path || !input.session_id || !paths.defaultsPath) process.exit(0);

    // Before any work, so a broken install or a broken config is reported on
    // the session's first hook run rather than whenever the first threshold
    // happens to be crossed.
    const config = sections(await loadConfig(input.session_id, paths));

    const measured = measure(String(input.transcript_path));
    if (!measured) process.exit(0);

    const limits = thresholds(config, measured.model);
    if (!limits) process.exit(0);

    const level =
      measured.tokens >= limits.urgent
        ? "urgent"
        : measured.tokens >= limits.notice
          ? "notice"
          : "none";
    const file = stateFile(input.session_id);
    const stored = readState(file);
    const recorded = LEVELS.includes(stored.level) ? stored.level : "none";
    const record = {
      level,
      model: measured.model,
      tokens: measured.tokens,
      at: new Date().toISOString(),
    };

    // Only a rise injects, but a fall is still recorded, so the record tracks
    // the context rather than the highest point the session ever reached: a
    // summarize that takes `urgent` back down to `notice` has to leave `urgent`
    // able to fire again on the next climb. A fall to `none` -- what a compact
    // produces -- drops the file, and the next climb starts over from there.
    if (LEVELS.indexOf(level) <= LEVELS.indexOf(recorded)) {
      if (level !== recorded) {
        if (level === "none") rmSync(file, { force: true });
        else writeState(file, record);
      }
      process.exit(0);
    }

    writeState(file, record);
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: fill(config.messages[level], {
            model: measured.model || "this model",
            tokens: formatTokens(measured.tokens),
            threshold: formatTokens(limits[level]),
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
