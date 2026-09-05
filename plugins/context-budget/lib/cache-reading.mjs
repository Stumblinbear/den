// What a cache scan reads like: the cut points still cached, what a cut at
// each of them summarizes away, what it keeps, how many turns it takes to pay
// for itself, and what sits above them.
//
// The cut-point script prints it, and nothing else does: the injected messages
// say the size and send the agent here, so a reading is never older than the
// moment the agent asked for one.
import { formatTokens } from "./config.mjs";
import { DEFAULT_READ_MULTIPLIER, paybackTurns, readMultiplier } from "./pricing.mjs";

// A wall-clock time to hand the user: local, 24-hour, no date. Everything
// quoted here expires within the hour.
const clock = (date) =>
  String(date.getHours()).padStart(2, "0") +
  ":" +
  String(date.getMinutes()).padStart(2, "0");

const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

// How this reading prices a cut: what the price table charges the model the
// scan read off the transcript. `assumed` marks a fallback to the default
// rate -- the transcript named no model, or there was no table to ask.
const priceOf = (scan, pricing) => {
  // Null only where there is no table to ask: a model the table has never
  // heard of takes its default.
  const rate = readMultiplier(pricing, scan.model);

  return { read: rate ?? DEFAULT_READ_MULTIPLIER, assumed: !scan.model || rate == null };
};

// The rate the opening line discloses, or null for a reading that discloses
// none: an assumed rate is worth a clause only where the reading quotes a
// figure that rate governs. Hung on a reading that prices nothing, it reads as
// a claim about the sentence it stands next to instead.
const disclosedRate = (price, quotesPayback) =>
  price.assumed && quotesPayback ? price.read : null;

// When the reading was taken, which lifetime it is reading against, and the
// rate it priced the payback figures at where that rate was a guess.
const header = (scan, rate) =>
  `Prompt cache, read at ${clock(scan.at)} (${scan.ttl} lifetime` +
  (rate === null ? ")" : `, payback at the default ${rate}x cache read)`);

// Whether the reading has a compaction to speak of. A boundary that kept
// prompts verbatim prices them, and that is worth a sentence. A boundary that
// kept nothing prices only the first prompt after it, which is the first prompt
// of the context and no cut point -- so it contributes nothing to choosing, and
// the reading is what it would be with no compaction in it at all.
const namesCompaction = (scan) => (scan.compaction?.kept.length ?? 0) > 0;

// What every reading opens with: the header, and the compaction above the
// cached range where it kept anything, since that is what prices the prompts
// the list does not.
const opening = (scan, rate) =>
  namesCompaction(scan)
    ? `${header(scan, rate)}. ${compactedTo(scan.compaction)}. ${keptClause(scan.compaction, "since then")}`
    : `${header(scan, rate)}.`;

// The whole of what there is to say when no cut point is left cached: a rewind
// costs its whole prefix wherever it lands, which leaves `/compact` -- unless a
// compaction has already bounded that price, and then the choice is the prompts
// it kept and nothing newer.
//
// Both sentences speak only of cut points: an empty list means every prompt a
// rewind would land on has gone cold, not that the context holds none cached
// and not that nothing has been sent -- a prompt in flight is both.
//
// Neither of them quotes a payback, so neither has a rate to disclose.
const emptyReading = (scan) =>
  scan.compaction
    ? `${header(scan, null)}. ${compactedTo(scan.compaction)}, and there is nothing newer to cut at.${scan.compaction.kept.length > 0 ? ` ${keptClause(scan.compaction, "")}` : ""}`
    : `${header(scan, null)}: no cut point is still cached, so any rewind re-reads its whole prefix at full price. Recommend \`/compact <focus line>\` instead.`;

// What the whole context comes to when the only prompt a turn has answered is
// its first: a cut there summarizes nothing, so the list is empty for a reason
// that is not "the cache has expired", and an unqualified "every prompt in the
// context is cached" over an empty list reads as exactly that. The qualifier
// counts turns because a prompt in flight is in the context too, and is no cut
// point.
const nothingToCutClause =
  "Every prompt in the context is cached; the only one with a turn after it is its first, so there is nothing to cut at yet.";

// Whether the oldest cached prompt is the first prompt of the current context:
// the walk reached the start of the file, or a compaction that kept no prompt
// of its own. A cut there summarizes nothing, so it is no use as a cut point
// and the whole context is cached by definition.
const opensTheContext = (scan) =>
  scan.compaction ? scan.compaction.kept.length === 0 : scan.above !== "colder";

// When the compaction happened and what it left behind, without the full stop:
// what follows it is either the prompts it kept or the fact that there is
// nothing newer to cut at.
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

// What a cut at a prompt costs, in the unit the agent can weigh it in against
// the work still in front of it: the turns it takes to pay for itself. Empty
// for a prompt there is no such figure for.
const paybackClause = (turns) =>
  turns === null ? "" : `, pays back after ${plural(turns, "turn")}`;

// The reading itself: an opening paragraph, the cut points as numbered rows,
// and what the rest of the session is, above and below them. Rows rather than
// a sentence because this is a choice between three things, and a paragraph
// that has to be unpicked into three is a worse way to put a choice.
//
// `pricing` is the price table, and the model it is asked about is the one the
// scan read off the transcript it is reading -- so a reading of another
// session's transcript is priced by that transcript, not by its caller. Null
// where there is no table.
export function cacheReading(scan, pricing = null) {
  const price = priceOf(scan, pricing);

  if (scan.prompts.length === 0) {
    return emptyReading(scan);
  }

  const listed = listedPrompts(scan);

  if (listed.length === 0) {
    return `${opening(scan, null)} ${nothingToCutClause}`;
  }

  // Priced before anything is written, since whether the opening line has a
  // rate to disclose turns on whether any of these came to a figure.
  const payback = listed.map((prompt) => paybackTurns(prompt, scan.ttl, price.read));
  const rate = disclosedRate(price, payback.some((turns) => turns !== null));

  const rows = listed.flatMap((prompt, i) => [
    `  ${i + 1}. "${prompt.text}"`,
    // What a cut here summarizes away, and what it keeps verbatim above it --
    // which the rewind writes back to the cache at the write price before any
    // of the saving starts.
    `     sent ${clock(prompt.sentAt)} | valid until ${clock(prompt.expiresAt)} | ${formatTokens(prompt.prefixTokens)} tokens before it, keeps ${formatTokens(prompt.keptTokens)}${paybackClause(payback[i])}`,
  ]);

  // The compaction gets a paragraph of its own: the rows below it are the
  // choice, and it is not one of them.
  const paragraphs = namesCompaction(scan)
    ? [opening(scan, rate), "Cached prompts, oldest first:"]
    : [`${opening(scan, rate)} Cached prompts, oldest first:`];

  paragraphs.push(rows.join("\n"), cachedRangeClause(scan));

  return paragraphs.join("\n\n");
}
