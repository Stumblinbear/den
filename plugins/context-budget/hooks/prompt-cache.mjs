// What the session transcript says about the prompt cache: which of the user's
// own prompts still have a cached prefix behind them, and therefore which rewind
// cut points are free.
//
// Both summarize directions leave the same prefix in place. "Summarize up to
// here" at prompt P sends the messages before P; "Summarize from here" sends
// the whole conversation and keeps everything before P. Either way the next
// turn's prefix is the conversation up to P-1, and that prefix was written by
// the request before P and last refreshed by the request that carried P. So:
//
//   the prefix before prompt P is cached iff P was sent less than one TTL ago,
//   and P's expiry is P.timestamp + TTL.
//
// Every prompt older than the oldest cached one costs a full-price read of
// everything before it, whichever direction the user picks.
//
// Read by the measurement hook, which bakes a snapshot into the message it
// injects, and by the cut-point script, which takes a fresh one on demand.
// What either of them says about a scan is `cache-reading.mjs`.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { eligible, openingWords } from "./rewind-picker.mjs";
import {
  cacheLifetime,
  contextTokens,
  DEFAULT_TTL,
  isCompaction,
  TTL_MS,
  turnUsage,
} from "./transcript.mjs";

// Big enough that a normal transcript's whole cached stretch is one or two
// reads, small enough that a session idle past its TTL -- where the newest
// prompt is already cold and the scan stops at it -- pays for almost nothing.
export const CHUNK_BYTES = 128 * 1024;

// --- reading the transcript backward ---------------------------------------

// The transcript's lines from the last to the first, read in chunks from the
// end. The scan stops as soon as it has its answer, so it costs the stretch
// back to the first cut point that is already cold rather than the whole
// file -- which is one lifetime of transcript in a session the user has been
// typing into, and more in one they have left running.
//
// Chunks are joined as bytes and split on newlines before decoding, so a
// multi-byte character straddling a chunk boundary is never cut in half.
function* linesBackward(path) {
  const fd = openSync(path, "r");

  try {
    let pos = fstatSync(fd).size;
    let pending = Buffer.alloc(0);

    while (pos > 0) {
      const length = Math.min(CHUNK_BYTES, pos);
      const chunk = Buffer.alloc(length);

      readSync(fd, chunk, 0, length, pos - length);
      pos -= length;

      const buf = pending.length > 0 ? Buffer.concat([chunk, pending]) : chunk;
      let end = buf.length;

      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i] !== 0x0a) {
          continue;
        }

        if (end > i + 1) {
          yield buf.toString("utf8", i + 1, end);
        }

        end = i;
      }

      // Everything above the earliest newline in this chunk is the start of a
      // line whose remainder is in the chunk before it.
      pending = buf.subarray(0, end);
    }

    if (pending.length > 0) {
      yield pending.toString("utf8");
    }
  } finally {
    closeSync(fd);
  }
}

// --- the scan ---------------------------------------------------------------

// What a compaction boundary says about itself, or null for an entry that is
// not one, or one too old to carry the metadata. `postTokens` is the context it
// left behind, and `preservedMessages.uuids` names the entries above it that it
// kept verbatim -- which is what makes them readable at all, since they stay
// where they are in the file rather than being rewritten below the boundary.
function boundaryDetail(entry) {
  if (entry.type !== "system" || entry.subtype !== "compact_boundary") {
    return null;
  }

  const meta = entry.compactMetadata;
  const at = new Date(entry.timestamp);

  if (typeof meta?.postTokens !== "number" || Number.isNaN(at.getTime())) {
    return null;
  }

  const uuids = meta.preservedMessages?.uuids;

  return {
    at,
    postTokens: meta.postTokens,
    kept: [],
    pending: new Set(Array.isArray(uuids) ? uuids : []),
  };
}

// The cache window over `path` as of `now`: the lifetime in force, the
// picker-eligible prompts whose prefix is still cached oldest first, and what
// lies above the oldest of them -- a colder cut point, a compaction, or the
// start of the file, which is the difference between "there are older cut
// points and they all cost" and "this is as far back as the session goes".
//
// A compaction above them is reported apart from the prompts: the first
// request after it wrote everything it kept verbatim to the cache in one
// piece, so a rewind anywhere in that stretch is a write of at most
// `postTokens`, the same price for all of them.
export function scanCacheWindow(path, now = Date.now()) {
  let ttl = null;
  let context = null;
  let unresolved = [];
  let pending = [];
  const warm = [];
  let above = "nothing";
  let compaction = null;
  let preserved = false;

  // Prices the prompts whose prefix size is settled against the lifetime that
  // prefix was written under: cached while the prompt is younger than it, and
  // cold otherwise -- which is where the cached stretch ends, since every
  // prompt above a cold one is older still.
  const settle = (lifetime) => {
    let expired = false;

    for (const prompt of pending) {
      const expiresAt = new Date(prompt.sentAt.getTime() + lifetime);

      if (expiresAt.getTime() > now) {
        warm.push({ ...prompt, expiresAt });
      } else {
        expired = true;
      }
    }

    pending = [];

    return expired;
  };

  for (const line of linesBackward(path)) {
    let entry;

    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    // A subagent shares the transcript: its turns are not this session's
    // context and its prompts are not in the picker, boundaries included.
    if (entry.isSidechain) {
      continue;
    }

    if (!preserved && isCompaction(entry)) {
      above = "compaction";
      preserved = true;
    }

    // Past the boundary: nothing here is part of the cached stretch, and the
    // only entries that matter are the ones the compaction kept.
    if (preserved) {
      if (!compaction) {
        compaction = boundaryDetail(entry);

        if (compaction) {
          if (compaction.pending.size === 0) {
            break;
          }

          continue;
        }

        // The summary entry sits between the end of the file and the boundary
        // it belongs to; anything else means there is no boundary to read.
        if (entry.isCompactSummary) {
          continue;
        }

        break;
      }

      if (compaction.pending.delete(entry.uuid)) {
        // The prompts a compaction kept are all priced alike by what it left
        // behind, so there is nothing to say about one of them but its words:
        // no expiry to quote and nothing to choose between them on.
        if (eligible(entry)) {
          compaction.kept.push(openingWords(entry));
        }

        if (compaction.pending.size === 0) {
          break;
        }
      }

      continue;
    }

    if (entry.type === "assistant") {
      const usage = turnUsage(entry);

      if (!usage) {
        continue;
      }

      const written = cacheLifetime(usage);
      // The prefix a rewind at the prompts just above this turn would re-read
      // is what this turn was sent, whether or not its request wrote it.
      const prefixTokens = contextTokens(usage);

      // The newest turn that wrote to the cache says which lifetime the
      // session is on now; the walk keeps going when the newest wrote nothing.
      ttl ??= written;

      // The newest turn's context is the context now, which is what a rewind
      // at any of these prompts keeps verbatim above the part it summarizes.
      context ??= prefixTokens;

      for (const prompt of unresolved) {
        pending.push({ ...prompt, prefixTokens });
      }

      unresolved = [];

      // A turn that wrote nothing was served from an entry an older request
      // wrote, and refreshing an entry does not extend it, so the prompts it
      // priced wait for that older request to say how long it lives.
      if (!written) {
        continue;
      }

      // Everything above a cold prompt is colder still: this is where the
      // cached stretch ends and the rest of the file stops mattering.
      if (settle(TTL_MS[written])) {
        above = "colder";
        break;
      }

      continue;
    }

    if (!eligible(entry)) {
      continue;
    }

    const sentAt = new Date(entry.timestamp);

    if (Number.isNaN(sentAt.getTime())) {
      continue;
    }

    unresolved.push({ text: openingWords(entry), sentAt });
  }

  // What the walk ended still holding. A prompt with no assistant turn behind
  // it in this stretch has whatever the walk ended on for its prefix: the
  // context a compaction left behind, or nothing at all at the start of the
  // file. Either way it is still a cut point, and with no writing turn left to
  // ask, the session's own lifetime is the only one on offer for any of them.
  // A cold one here is still a cold one above the cached ones, so it settles
  // `above` too -- the first prompt of a session that opened over a lifetime
  // ago is exactly this case.
  const opening = compaction?.postTokens ?? 0;

  for (const prompt of unresolved) {
    pending.push({ ...prompt, prefixTokens: opening });
  }

  if (settle(TTL_MS[ttl ?? DEFAULT_TTL]) && !compaction) {
    above = "colder";
  }

  return {
    ttl: ttl ?? DEFAULT_TTL,
    // What a cut at each prompt keeps verbatim is everything from it to the end
    // of the context, and the first request after the rewind writes all of it
    // to the cache before any of the saving starts.
    prompts: warm.reverse().map((prompt) => ({
      ...prompt,
      keptTokens: Math.max(0, (context ?? prompt.prefixTokens) - prompt.prefixTokens),
    })),
    above,
    compaction: compaction && {
      at: compaction.at,
      postTokens: compaction.postTokens,
      kept: compaction.kept.reverse(),
    },
    at: new Date(now),
  };
}
