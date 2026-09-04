// What a session transcript's entries mean, for the three readers that have to
// agree about it: the measurement hook, the resume guard and the cache scan.
//
// Each of them reads the same JSONL and asks the same three questions -- how
// big was the context, which cache lifetime was it written under, and is this
// the point where the context was thrown away -- so the answers live here once
// rather than three times over.

// The two lifetimes the API offers, in milliseconds.
export const TTL_MS = { "5m": 5 * 60_000, "1h": 60 * 60_000 };

// Used where no turn a reader can see recorded a split at all. The API's own
// default, and the pessimistic answer of the two.
export const DEFAULT_TTL = "5m";

// The context a turn was sent: prompt, plus what its request wrote to the
// cache, plus what it read from it. The three together are the whole input,
// whatever the split between them happened to be.
export const contextTokens = (usage) =>
  (usage.input_tokens || 0) +
  (usage.cache_creation_input_tokens || 0) +
  (usage.cache_read_input_tokens || 0);

// The usage of a turn that was really taken, or null. A request that failed
// before the model saw it is written as an assistant entry of its own, with a
// usage of every field zero: it was sent no context, so it read nothing, wrote
// nothing and left no cache entry behind, and it is a turn to none of these
// readers.
export function turnUsage(entry) {
  const usage = entry.message?.usage;

  return usage && contextTokens(usage) > 0 ? usage : null;
}

// The lifetime the turn's request wrote the cache under, from the split it was
// billed in, or null when it wrote nothing at all. A request served entirely
// from a warm cache is that null: it refreshed an entry another request wrote,
// so it says nothing about how long that entry lives.
export function cacheLifetime(usage) {
  if ((usage.cache_creation?.ephemeral_1h_input_tokens || 0) > 0) {
    return "1h";
  }

  if ((usage.cache_creation?.ephemeral_5m_input_tokens || 0) > 0) {
    return "5m";
  }

  return null;
}

// Where the context was replaced by a summary of itself. `/compact`,
// auto-compact and both rewind summarize directions each append a
// `compact_boundary` system entry followed by an `isCompactSummary` user
// entry, so either one alone is enough to recognise it -- a path that writes
// only the summary is covered without having to know which paths write a
// boundary. Nothing above it is in the current context.
export const isCompaction = (entry) =>
  (entry.type === "system" && entry.subtype === "compact_boundary") ||
  (entry.type === "user" && entry.isCompactSummary === true);
