// Which transcript entries `/rewind` offers as cut points, and what its rows
// read like. A prompt the picker will not list is no use as a recommendation,
// however cheap a cut there would be, and a prompt quoted in words that do not
// match its row is no use either -- the user has to find it in the list.
//
// The rules below have to match what the `/rewind` picker lists. Nothing in a
// transcript entry marks whether the picker would offer it, so the rules are
// kept in step with the picker's own or not at all.

// Long enough to be unique among the user's prompts in the picker, short
// enough to quote inside a sentence.
const OPENING_CHARS = 72;

// Wrapper forms the picker refuses to list: transcript-only records of what a
// local command or a bash prompt printed, notifications from a finished
// subagent, the periodic tick, and a message relayed from another session. A
// slash command is *not* one of them -- the picker lists it, and it is as good
// a cut point as any typed prompt, `/compact` excepted below.
const WRAPPED = [
  "local-command-stdout",
  "local-command-stderr",
  "bash-stdout",
  "bash-stderr",
  "task-notification",
  "tick",
];

// Markers the harness writes in the user's place -- an interrupt, a refused
// tool call, a turn it wants no reply to. They are stored as user entries with
// none of the flags above, and the picker recognises them by their text alone,
// which is the only thing that can: no prompt anyone types is one of these.
const MARKERS = new Set([
  "[Request interrupted by user]",
  "[Request interrupted by user for tool use]",
  "[Tool call did not complete: the turn was ended to deliver the message that follows. Nothing refused it; re-run it if still needed.]",
  "[Tool call skipped: the turn ended to deliver the message that follows before this call ran. Nothing refused it; re-run it if still needed.]",
  "The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed.",
  "No response requested.",
]);

const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter((block) => block?.type === "text")
          .map((block) => String(block.text ?? ""))
          .join("\n")
      : "";

const inner = (text, tag) =>
  text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? null;

// Whether the picker would offer this entry, and whether it is worth offering:
// a user turn that is not a tool result, not a harness-generated record, and
// either has no origin or has a human one.
export function eligible(entry) {
  if (entry.type !== "user") {
    return false;
  }

  const content = entry.message?.content;

  if (Array.isArray(content) && content[0]?.type === "tool_result") {
    return false;
  }

  if (entry.isMeta || entry.isCompactSummary || entry.isVisibleInTranscriptOnly) {
    return false;
  }

  if (entry.origin && entry.origin.kind !== "human") {
    return false;
  }

  if (entry.stackedExpansion) {
    return false;
  }

  const text = textOf(content).trim();

  if (text === "" || MARKERS.has(text) || text.startsWith("<teammate-message ")) {
    return false;
  }

  // The compaction's own command. The harness stores it after the boundary it
  // caused and stamps it from before it, so a scan reads it as the first
  // prompt of the new context -- and a rewind there keeps that compaction as
  // the first message of the context, redoing what the session has just done.
  // Every other slash command is as good a cut point as a typed prompt.
  if (inner(text, "command-name")?.trim() === "/compact") {
    return false;
  }

  return !WRAPPED.some((tag) => text.includes(`<${tag}>`));
}

// What the picker's row for this entry reads like, so the user can match the
// quoted words against the list in front of them. A slash command is listed by
// its name and arguments rather than by the XML the transcript stores it as,
// and a prompt the harness prefixed with system reminders is listed from the
// user's own first word.
export function openingWords(entry) {
  const text = textOf(entry.message?.content);
  const command = inner(text, "command-name");
  const shown = command
    ? `${command} ${inner(text, "command-args") ?? ""}`
    : stripReminders(text);
  const line = shown.replace(/\s+/g, " ").trim();

  if (line.length <= OPENING_CHARS) {
    return line;
  }

  const cut = line.slice(0, OPENING_CHARS);
  const space = cut.lastIndexOf(" ");
  const kept = space > OPENING_CHARS / 2 ? cut.slice(0, space) : cut;

  // Trailing punctuation before the ellipsis reads as a typo ("forwards....").
  return kept.replace(/[\s.,;:!?-]+$/, "") + "...";
}

function stripReminders(text) {
  let rest = text.trimStart();

  while (rest.startsWith("<system-reminder>")) {
    const close = rest.indexOf("</system-reminder>");

    if (close < 0) {
      break;
    }

    rest = rest.slice(close + "</system-reminder>".length).trimStart();
  }

  return rest;
}
