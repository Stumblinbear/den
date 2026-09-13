// What a run waiting out an idle stretch does next to keep a session's prompt
// cache warm.
//
// * `reading` is what one check takes off the transcript
// * `Stretch` is what the run carries between checks
// * `nextStep` decides from the two whether to post, sleep or give up
// * `wakeText` writes what a post says
//
// The run that sleeps, posts and holds the lock is the Stop entry in
// `hooks/wake.mts`. It carries one fact of its own, what it has posted, and
// reads the transcript afresh at every check, since the session moves while
// the run sleeps.
import { type Launch, pendingReader, taskNotification } from "./background.mts";
import { fill } from "./messages.mts";
import { eligible } from "./rewind-picker.mts";
import type { Wake } from "./settings.mts";
import {
	type CacheTtl,
	contextEntries,
	lifetimeMs,
	lifetimeOf,
	turnUsage,
} from "./transcript.mts";

/** What one check reads off the transcript. */
export interface Reading {
	/** The work still in the background. */
	readonly pending: readonly Launch[];
	/** The lifetime in force; null where no turn in the context wrote to the cache. */
	readonly lifetime: CacheTtl | null;
	/**
	 * When the newest turn was taken, in ms since the epoch, which is when the
	 * cache was last refreshed; 0 where the context holds no turn. A wake's
	 * own reply counts, since it refreshes the cache like any other turn.
	 */
	readonly refreshedAt: number;
	/**
	 * When the newest real turn began, in ms since the epoch: one of the user's
	 * own prompts, or a notification that background work finished, which is
	 * the session moving on its own. A wake the run posted is neither; 0 where
	 * the context holds no real turn.
	 */
	readonly turnedAt: number;
}

/** What a waiting run remembers between checks. */
export interface Stretch {
	/** How many wakes it has posted since the last real turn. */
	readonly spent: number;
	/** When it posted the last of them, in ms since the epoch; 0 for none. */
	readonly lastPostAt: number;
}

/** A run that has posted nothing yet. */
export const FRESH: Stretch = { spent: 0, lastPostAt: 0 };

/** What the run does next. */
export type Step =
	/**
	 * Post a wake now and carry `stretch` into the next check. `stretch.spent`
	 * is the wake's ordinal, out of `times`.
	 */
	| { readonly kind: "post"; readonly stretch: Stretch; readonly times: number }
	/** Sleep this long, then read again. */
	| { readonly kind: "wait"; readonly ms: number }
	/** The stretch is over: stop checking, and let the cache go. */
	| { readonly kind: "stop" };

/** The step that posts, as `wakeText` takes it. */
export type Post = Extract<Step, { kind: "post" }>;

const STOP: Step = { kind: "stop" };

/** The three facts a reading takes off the newest entries, null until seen. */
interface Times {
	refreshedAt: number | null;
	turnedAt: number | null;
	lifetime: CacheTtl | null;
}

/**
 * One check's reading of the transcript at `path`, over the entries still in
 * the context.
 *
 * Raises whatever opening the file raised, as `contextEntries` does.
 */
export function reading(path: string): Reading {
	const times: Times = { refreshedAt: null, turnedAt: null, lifetime: null };
	const work = pendingReader();

	for (const entry of contextEntries(path)) {
		work.take(entry);
		note(times, entry);
	}

	return {
		pending: work.read(),
		lifetime: times.lifetime,
		refreshedAt: times.refreshedAt ?? 0,
		turnedAt: times.turnedAt ?? 0,
	};
}

/**
 * What an entry says about the times, where nothing newer has said it yet.
 * The newest turn really taken refreshed the cache, and the newest turn that
 * wrote to the cache set the lifetime, which is not always the same one: a
 * turn served entirely from a warm cache writes nothing back. An entry whose
 * timestamp will not parse says nothing about when, so the next one down says
 * it instead.
 */
function note(times: Times, entry: Record<string, unknown>): void {
	if (entry["type"] === "assistant") {
		if (turnUsage(entry) !== null) {
			times.refreshedAt ??= stampOf(entry);
		}

		times.lifetime ??= lifetimeOf(entry);
	} else if (
		times.turnedAt === null &&
		(eligible(entry) || taskNotification(entry) !== null)
	) {
		times.turnedAt = stampOf(entry);
	}
}

/**
 * What a run holding `stretch` does next: post a wake, sleep and read again,
 * or give the stretch up.
 *
 * @remarks
 * A stretch is over when there is nothing to keep warm: no work pending, no
 * turn to measure the cache's expiry from, a lifetime whose row is off, or a
 * cache already past its expiry, which a wake would rebuild rather than keep.
 *
 * A run whose count is spent waits the cache out rather than giving the
 * stretch up: the reply to its last wake ends a turn, Claude Code runs a Stop
 * on it, and a stretch let go there is claimed by that Stop's own run with a
 * fresh count. The count is spent against the last real turn, so a turn newer
 * than the last post starts it over and a wake's own reply does not.
 *
 * A wake posted and not yet answered is waited on rather than posted again,
 * since the session reads its inbox at its own pace and a second post would
 * be a second turn. A wait never exceeds the 5m row's due interval, whatever
 * the lifetime in force: the lifetime can drop to 5m mid-session, and a run
 * asleep for the hour would miss the shorter cache altogether.
 *
 * @param now - ms since the epoch, as the reading's times are
 */
export function nextStep(
	stretch: Stretch,
	reading: Reading,
	wake: Wake,
	now: number,
): Step {
	if (
		!wake.enabled ||
		reading.pending.length === 0 ||
		reading.refreshedAt === 0 ||
		reading.lifetime === null
	) {
		return STOP;
	}

	const row = wake.rows[reading.lifetime];
	const expiresAt = reading.refreshedAt + lifetimeMs(reading.lifetime);

	if (row === null || now >= expiresAt) {
		return STOP;
	}

	const spent = reading.turnedAt > stretch.lastPostAt ? 0 : stretch.spent;
	const bound = longestWait(wake);

	if (spent >= row.times || stretch.lastPostAt > reading.refreshedAt) {
		return { kind: "wait", ms: Math.min(expiresAt - now, bound) };
	}

	const dueAt = expiresAt - row.before;

	if (now < dueAt) {
		return { kind: "wait", ms: Math.min(dueAt - now, bound) };
	}

	return {
		kind: "post",
		stretch: { spent: spent + 1, lastPostAt: now },
		times: row.times,
	};
}

/** The 5m row's due interval, or the 5m lifetime itself where that row is off. */
const longestWait = (wake: Wake): number =>
	lifetimeMs("5m") - (wake.rows["5m"]?.before ?? 0);

/** An entry's timestamp in ms since the epoch, and null for one that will not parse. */
function stampOf(entry: Record<string, unknown>): number | null {
	const stamp = Date.parse(String(entry["timestamp"]));

	return Number.isNaN(stamp) ? null : stamp;
}

/**
 * The message a wake posts: a first line naming the wake's ordinal and the
 * work still running, and `body` under it.
 *
 * @remarks
 * The first line is what the user sees in the session's preview of the
 * message; `body` is the agent's to act on. The `{n}`, `{times}` and
 * `{pending}` placeholders in `body` are filled with the same three numbers
 * the first line carries.
 */
export function wakeText(post: Post, reading: Reading, body: string): string {
	const pending = reading.pending.length;
	const values = {
		n: String(post.stretch.spent),
		times: String(post.times),
		pending: String(pending),
	};

	return [
		`Cache wake ${values.n} of ${values.times}: ${pending} background ${pending === 1 ? "task" : "tasks"} still running.`,
		fill(body, values),
	].join("\n");
}
