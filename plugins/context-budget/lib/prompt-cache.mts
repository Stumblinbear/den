// What the session transcript says about the prompt cache: which of the user's
// own prompts still have a cached prefix behind them, and therefore which
// rewind cut points are free.
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
// Read by the cut-point script, which scans on demand. What it says about a
// scan is `cache-reading.mts`.
import {
	type BoundaryReader,
	boundaryReader,
	type Compaction,
} from "./compaction.mts";
import { linesBackward } from "./lines-backward.mts";
import { eligible, openingWords } from "./rewind-picker.mts";
import {
	type CacheTtl,
	cacheLifetime,
	DEFAULT_TTL,
	entryIn,
	inputTokens,
	isCompaction,
	LONGEST_LIFETIME_MS,
	lifetimeMs,
	turnModel,
	turnUsage,
} from "./transcript.mts";

/** One cut point: a prompt the picker would list, with what a cut there moves. */
export interface CachedPrompt {
	/** The prompt's opening words, as the picker's own row reads. */
	readonly text: string;
	readonly sentAt: Date;
	readonly expiresAt: Date;
	/** Everything before it, which a cut there summarizes away. */
	readonly prefixTokens: number;
	/** Everything from it down, which a cut there keeps verbatim. */
	readonly keptTokens: number;
}

/**
 * What the walk met that the list does not hold: nothing to select, a colder
 * cut point, or a compaction -- the difference between "there is nothing
 * further back to cut at", "there are other cut points and they cost" and "the
 * prompts above are priced by the compaction and by nothing else". A colder
 * one is usually above the cached prompts and can sit among them, where a 5m
 * turn left it cold under prefixes a 1h turn wrote either side of it.
 */
export type Above =
	| { readonly kind: "nothing" }
	| { readonly kind: "colder" }
	| { readonly kind: "compaction"; readonly compaction: Compaction };

export interface CacheWindow {
	readonly ttl: CacheTtl;
	/**
	 * Empty where the walk met no turn to take it from: a context that is
	 * nothing but a compaction, or a transcript whose entries name no model.
	 */
	readonly model: string;
	/** The picker-eligible prompts whose prefix is still cached, oldest first. */
	readonly prompts: readonly CachedPrompt[];
	readonly above: Above;
	/** When the scan was taken, which is what every expiry is judged against. */
	readonly at: Date;
}

/** A prompt met on the way back, before the walk knows what it cost. */
interface Unresolved {
	readonly text: string;
	readonly sentAt: Date;
}

/** The same with its prefix settled, before the walk knows if it is cached. */
interface Priced extends Unresolved {
	readonly prefixTokens: number;
}

/** The same again, found cached: all a cut point needs but its kept size. */
interface Settled extends Priced {
	readonly expiresAt: Date;
}

/** Everything the walk carries between entries. */
interface Walk {
	ttl: CacheTtl | null;
	context: number | null;
	model: string;
	unresolved: Unresolved[];
	pending: Priced[];
	readonly warm: Settled[];
	/** True once a prompt the walk met was found already cold. */
	colder: boolean;
	readonly boundary: BoundaryReader;
	/** True once the walk is past a compaction, and reading its boundary. */
	preserved: boolean;
}

/**
 * The cache window over `path` as of `now`: the lifetime in force, the model
 * the transcript is on, the picker-eligible prompts a turn has answered whose
 * prefix is still cached oldest first, and what lies above the oldest of them.
 *
 * A compaction above them is reported apart from the prompts: the first
 * request after it wrote everything it kept verbatim to the cache in one
 * piece, so a rewind anywhere in that stretch is a write of at most
 * `postTokens`, the same price for all of them.
 */
export function scanCacheWindow(path: string, now = Date.now()): CacheWindow {
	const walk: Walk = {
		ttl: null,
		context: null,
		model: "",
		unresolved: [],
		pending: [],
		warm: [],
		colder: false,
		boundary: boundaryReader(),
		preserved: false,
	};

	for (const line of linesBackward(path)) {
		const entry = entryIn(line);

		// A subagent shares the transcript: its turns are not this session's
		// context and its prompts are not in the picker, boundaries included.
		if (entry === null || entry["isSidechain"]) {
			continue;
		}

		if (!walk.preserved && isCompaction(entry)) {
			walk.preserved = true;
		}

		// Past the boundary nothing is part of the cached stretch, and the only
		// entries that matter are the ones the compaction kept.
		if (
			walk.preserved
				? walk.boundary.take(entry)
				: belowBoundary(walk, entry, now)
		) {
			break;
		}
	}

	return ended(walk, now);
}

/** The cached stretch itself. True where the walk has its answer and stops. */
function belowBoundary(
	walk: Walk,
	entry: Record<string, unknown>,
	now: number,
): boolean {
	if (entry["type"] === "assistant") {
		return tookTurn(walk, entry, now);
	}

	if (!eligible(entry)) {
		return false;
	}

	// A prompt with no turn yet to answer it: walking backward, `context` is
	// still null for exactly those. Its prefix is the whole current context,
	// so a cut there keeps nothing verbatim -- `/compact` by another name --
	// and listing it would displace the newest prompt that is a cut point.
	if (walk.context === null) {
		return false;
	}

	const sentAt = new Date(String(entry["timestamp"]));

	if (!Number.isNaN(sentAt.getTime())) {
		walk.unresolved.push({ text: openingWords(entry), sentAt });
	}

	return false;
}

/** An assistant turn: what it was sent prices the prompts just above it. */
function tookTurn(
	walk: Walk,
	entry: Record<string, unknown>,
	now: number,
): boolean {
	const usage = turnUsage(entry);

	if (usage === null) {
		return false;
	}

	const written = cacheLifetime(usage);
	// The prefix a rewind at the prompts just above this turn would re-read is
	// what this turn was sent, whether or not its request wrote it.
	const prefixTokens = inputTokens(usage);

	// The newest turn that wrote to the cache says which lifetime the session
	// is on now; the walk keeps going when the newest wrote nothing.
	walk.ttl ??= written;

	// The newest turn's context is the context now, which is what a rewind at
	// any of these prompts keeps verbatim above the part it summarizes -- and
	// the model that turn was sent to is the one whose prices the whole reading
	// is figured at, taken from the same turn so the two cannot be read off
	// different requests. A turn `turnUsage` refuses never gets here, which is
	// what keeps the synthetic id of a failed request out.
	if (walk.context === null) {
		walk.context = prefixTokens;
		walk.model = turnModel(entry);
	}

	for (const prompt of walk.unresolved) {
		walk.pending.push({ ...prompt, prefixTokens });
	}

	walk.unresolved = [];

	// A turn that wrote nothing settles nothing -- it was served from an entry an
	// older request wrote, and a read renews an entry for the lifetime it was
	// written under without changing that lifetime, so the prompts it priced
	// wait for that older request to say how long they live.
	return written !== null && settle(walk, lifetimeMs(written), now);
}

/**
 * Prices the prompts whose prefix size is settled against the lifetime that
 * prefix was written under: cached while the prompt is younger than it, and
 * cold otherwise. A cold one is dropped and the walk carries on, because older
 * is not colder once the lifetime has switched -- a prefix a 1h turn wrote
 * outlives one a later 5m turn wrote, so a prompt above a cold one can still
 * be cached. True once a prompt is older than the longest lifetime there is,
 * which is where the cached stretch really ends: no writer could have kept
 * that one, and every prompt above it is older still.
 */
function settle(walk: Walk, lifetime: number, now: number): boolean {
	let pastEveryLifetime = false;

	for (const prompt of walk.pending) {
		const expiresAt = new Date(prompt.sentAt.getTime() + lifetime);

		if (expiresAt.getTime() > now) {
			walk.warm.push({ ...prompt, expiresAt });
			continue;
		}

		// Dropped -- and where it is older than the longest lifetime any turn
		// could have written it under, so is every prompt above it.
		walk.colder = true;
		pastEveryLifetime ||= prompt.sentAt.getTime() + LONGEST_LIFETIME_MS <= now;
	}

	walk.pending = [];

	return pastEveryLifetime;
}

/**
 * What the walk ended still holding. A prompt with no assistant turn behind it
 * in this stretch has whatever the walk ended on for its prefix: the context a
 * compaction left behind, or nothing at all at the start of the file. Either
 * way it is still a cut point, and with no writing turn left to ask, the
 * session's own lifetime is the only one on offer for any of them. A cold one
 * here is still a cold one above the cached ones, so it settles what lies
 * above too -- the first prompt of a session that opened over a lifetime ago
 * is exactly this case.
 */
function ended(walk: Walk, now: number): CacheWindow {
	const compaction = walk.boundary.read();

	for (const prompt of walk.unresolved) {
		walk.pending.push({ ...prompt, prefixTokens: compaction?.postTokens ?? 0 });
	}

	settle(walk, lifetimeMs(walk.ttl ?? DEFAULT_TTL), now);

	const context = walk.context;

	return {
		ttl: walk.ttl ?? DEFAULT_TTL,
		model: walk.model,
		// What a cut at each prompt keeps verbatim is everything from it to the
		// end of the context, and the first request after the rewind writes all
		// of it to the cache before any of the saving starts.
		prompts: walk.warm.reverse().map((prompt) => ({
			...prompt,
			keptTokens: Math.max(
				0,
				(context ?? prompt.prefixTokens) - prompt.prefixTokens,
			),
		})),
		above: endedAbove(walk, compaction),
		at: new Date(now),
	};
}

/**
 * Which of the three the walk ended on. A boundary it read outranks a cold
 * prompt, since the prompts that boundary kept are priced by it and by nothing
 * else. A boundary it could not read -- a transcript holding the compaction's
 * summary alone, or one too old to carry the metadata -- prices nothing and
 * names no prompt to choose, so what lies above the cached stretch there is
 * what lies above it at the start of the file.
 */
function endedAbove(walk: Walk, compaction: Compaction | null): Above {
	if (compaction !== null) {
		return { kind: "compaction", compaction };
	}

	return walk.colder ? { kind: "colder" } : { kind: "nothing" };
}
