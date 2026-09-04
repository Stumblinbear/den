// What a cache scan reads like: the cut points still cached, what a cut at
// each of them summarizes away and what it keeps, and what sits above them.
//
// One renderer, two callers. The measurement hook bakes this into the message
// it injects and the cut-point script prints it on demand, and the agent
// chooses a cut point from whichever it has in front of it -- so the two say
// the identical thing, down to the layout, rather than two wordings it would
// have to reconcile.
import { formatTokens } from "./config.mjs";
import { scanCacheWindow } from "./prompt-cache.mjs";

// A wall-clock time to hand the user: local, 24-hour, no date. Everything
// quoted here expires within the hour.
const clock = (date) =>
  String(date.getHours()).padStart(2, "0") +
  ":" +
  String(date.getMinutes()).padStart(2, "0");

// When the reading was taken and which lifetime it is reading against.
const header = (scan) =>
  `Prompt cache, read at ${clock(scan.at)} (${scan.ttl} lifetime)`;

// Whether the reading has a compaction to speak of. A boundary that kept
// prompts verbatim prices them, and that is worth a sentence. A boundary that
// kept nothing prices only the first prompt after it, which is the first prompt
// of the context and no cut point -- so it contributes nothing to choosing, and
// the reading is what it would be with no compaction in it at all.
const namesCompaction = (scan) => (scan.compaction?.kept.length ?? 0) > 0;

// What every reading opens with: the header, and the compaction above the
// cached range where it kept anything, since that is what prices the prompts
// the list does not.
const opening = (scan) =>
  namesCompaction(scan)
    ? `${header(scan)}. ${compactedTo(scan.compaction)}. ${keptClause(scan.compaction, "since then")}`
    : `${header(scan)}.`;

// The whole of what there is to say when no prompt is left cached: a rewind
// costs its whole prefix wherever it lands, which leaves `/compact` -- unless a
// compaction has already bounded that price, and then what happened is that the
// session compacted and has been idle since.
const emptyReading = (scan) =>
  scan.compaction
    ? `${header(scan)}. ${compactedTo(scan.compaction)} and nothing has been sent since.${scan.compaction.kept.length > 0 ? ` ${keptClause(scan.compaction, "")}` : ""}`
    : `${header(scan)}: no prompt is still cached, so any rewind re-reads its whole prefix at full price. Recommend \`/compact <focus line>\` instead.`;

// What the whole context comes to when the only prompt in it is its first: a
// cut there summarizes nothing, so the list is empty for a reason that is not
// "the cache has expired", and an unqualified "every prompt in the context is
// cached" over an empty list reads as exactly that.
const nothingToCutClause =
  "Every prompt in the context is cached; the only one is its first, so there is nothing to cut at yet.";

// Whether the oldest cached prompt is the first prompt of the current context:
// the walk reached the start of the file, or a compaction that kept no prompt
// of its own. A cut there summarizes nothing, so it is no use as a cut point
// and the whole context is cached by definition.
const opensTheContext = (scan) =>
  scan.compaction ? scan.compaction.kept.length === 0 : scan.above !== "colder";

// When the compaction happened and what it left behind, without the full stop:
// what follows it is either the prompts it kept or the fact that the session
// has been idle since.
const compactedTo = (compaction) =>
  `The session was compacted at ${clock(compaction.at)} down to ${formatTokens(compaction.postTokens)} tokens`;

// The prompts the compaction kept verbatim. All of them were written to the
// cache in one piece by the first request after it, so a rewind at any of them
// is a write of at most what the compaction left behind, and there is nothing
// to choose between them on price. It says nothing about the prompts sent
// since: the scan reaches a boundary only when every one of those is still
// cached, so they are either the list that follows this clause or an empty set.
const keptClause = (compaction, since) =>
  `The ${compaction.kept.length === 1 ? "one prompt" : `${compaction.kept.length} prompts`} kept verbatim${since ? ` ${since}` : ""}, from "${compaction.kept[0]}" on, can be rewound to for at most that price.`;

// What the listed prompts say about the rest of the session: that everything
// after them is cached as well, and what sits above them -- more prompts that
// have gone cold, or nothing selectable at all, which is the difference between
// a cut that could go further back for a price and one that could not go
// further back at all. A compaction above them is priced by its own clause.
const cachedRangeClause = (scan) =>
  opensTheContext(scan)
    ? "Every prompt in the context is cached."
    : scan.compaction
      ? "Every prompt after the first is cached too."
      : "Every prompt after the first is cached too; every prompt before it is not, and a rewind there re-reads its whole prefix at full price.";

// The prompts worth choosing between, oldest first. Everything newer than the
// oldest cached prompt is cached too, so a busy hour is dozens of rows that all
// say the same thing; three across the range are enough to choose between, and
// the middle one is picked by size rather than by clock so that the choice is
// spread over the context rather than over the session's idle time.
function listedPrompts(scan) {
  // The first prompt of the context summarizes nothing, so it is not a cut
  // point, and neither the middle nor the newest may fall back to it.
  const pool = opensTheContext(scan) ? scan.prompts.slice(1) : scan.prompts;

  if (pool.length === 0) {
    return [];
  }

  const oldest = pool[0];
  const newest = pool[pool.length - 1];
  const halfway = (oldest.prefixTokens + newest.prefixTokens) / 2;
  let middle = oldest;

  for (const prompt of pool) {
    // Strictly closer, walking oldest first: a tie goes to the older.
    if (
      Math.abs(prompt.prefixTokens - halfway) <
      Math.abs(middle.prefixTokens - halfway)
    ) {
      middle = prompt;
    }
  }

  const listed = [];

  for (const prompt of [oldest, middle, newest]) {
    if (!listed.includes(prompt)) {
      listed.push(prompt);
    }
  }

  return listed;
}

// The reading itself: an opening paragraph, the cut points as numbered rows,
// and what the rest of the session is, above and below them. Rows rather than
// a sentence because this is a choice between three things, and a paragraph
// that has to be unpicked into three is a worse way to put a choice.
export function cacheReading(scan) {
  if (scan.prompts.length === 0) {
    return emptyReading(scan);
  }

  const listed = listedPrompts(scan);

  if (listed.length === 0) {
    return `${opening(scan)} ${nothingToCutClause}`;
  }

  const rows = listed.flatMap((prompt, i) => [
    `  ${i + 1}. "${prompt.text}"`,
    // What a cut here summarizes away, and what it keeps verbatim above it --
    // which the rewind writes back to the cache at full price before any of
    // the saving starts.
    `     sent ${clock(prompt.sentAt)} | valid until ${clock(prompt.expiresAt)} | ${formatTokens(prompt.prefixTokens)} tokens before it, keeps ${formatTokens(prompt.keptTokens)}`,
  ]);

  // The compaction gets a paragraph of its own: the rows below it are the
  // choice, and it is not one of them.
  const paragraphs = namesCompaction(scan)
    ? [opening(scan), "Cached prompts, oldest first:"]
    : [`${opening(scan)} Cached prompts, oldest first:`];

  paragraphs.push(rows.join("\n"), cachedRangeClause(scan));

  return paragraphs.join("\n\n");
}

// The `{cache}` placeholder in both injected messages: the same reading, taken
// at the moment of injection.
//
// A snapshot, not a reading. The agent is told to carry on with its task and
// raise the recommendation later, so the passage has to carry its own clock
// time and its own expiries -- by the time it is acted on, both may have
// passed.
//
// Never throws: the level crossing is what the message is for, and a transcript
// this cannot make sense of must not cost the user the notice itself.
export function cacheSnapshot(path, now = Date.now()) {
  try {
    return cacheReading(scanCacheWindow(path, now));
  } catch {
    return "Prompt cache: state could not be determined from the transcript, so treat the cost of any rewind cut point as unknown.";
  }
}
