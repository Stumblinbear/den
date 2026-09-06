// The watcher's side of the session record: what it keeps there, when the
// judge is worth consulting, and where an answer leaves that state. The three
// are one subject, since what one run writes is what the next run's gate reads
// back. Nothing here reads a model or spawns anything: the call itself is
// `judge.mts`, and what the session is told is the Stop entry's own output.
//
// The record holds no advice, because none of it has to outlive the run that
// gets it: Claude Code hands an async hook's output to the model on the next
// turn, so the run that asks the judge is also the run that answers the
// session. What is left in the record is what the next Stop's gate reads: the
// turn the state was written at, when the judge may be consulted again, the
// call in flight, and the verdict standing.
import { type Option, optionIn, type Wait } from "./answer.mts";
import type { Answer } from "./judge.mts";
import type { Turn } from "./recent-turns.mts";
import type { Thresholds } from "./settings.mts";
import { fieldsOf } from "./shared/fields.mts";
import type { ToolUse } from "./transcript.mts";

/**
 * Where the context stands on the watcher's own ladder, which is the notice
 * ladder with the midpoint between its two rungs added: the checks come closer
 * together as the cost of missing a cut point rises, and a delivered verdict
 * is over once the context has moved off the rung it was judged on.
 */
export type Rung = "none" | "notice" | "midpoint" | "urgent";

const RUNGS: readonly Rung[] = ["none", "notice", "midpoint", "urgent"];

/**
 * The rungs the judge is consulted on: past the notice, under the urgent. It
 * is the only rung a verdict can carry, since it is the only rung a verdict is
 * ever made on.
 */
export type Watched = Extract<Rung, "notice" | "midpoint">;

const TURNS: Readonly<Record<Wait, number>> = {
	"next turn": 1,
	"a few turns": 3,
	later: 8,
};

/** What the judge found, as the record keeps it. */
export interface Verdict {
	/** The rung it was judged on; it is over once the context is off that. */
	readonly rung: Watched;
	/** What it recommended, which is what the session was told. */
	readonly option: Option;
}

/** Everything the watcher keeps between the runs of one session. */
export interface WatcherState {
	/**
	 * The turn count the rest of this was written at. A later run that counts
	 * fewer turns than this is looking at a context the state was not judged
	 * against, and starts over from `FRESH`.
	 */
	readonly turn: number;
	/**
	 * The context `turn` was counted in, as `latestTurn` names one. A run that
	 * reads a different one is looking at a conversation none of this was
	 * judged against, whatever the count has climbed back to.
	 */
	readonly context: string;
	/** The earliest turn count the judge may be consulted on again. */
	readonly next: number;
	/** When the judge now in flight was started, and 0 for none in flight. */
	readonly startedAt: number;
	readonly verdict: Verdict | null;
}

/** A session the watcher has done nothing in yet. */
export const FRESH: WatcherState = {
	turn: 0,
	context: "",
	next: 0,
	startedAt: 0,
	verdict: null,
};

/** What the gate reads about the turn that has just ended. */
export interface Turned {
	/** How many of the user's prompts the context holds, this one included. */
	readonly count: number;
	/** What identifies the context that count was taken in. */
	readonly context: string;
	readonly rung: Rung;
	/** Whether it landed something a wait is cut short for. */
	readonly landing: boolean;
}

/** A turn the judge is consulted about. */
export interface Judged extends Turned {
	readonly rung: Watched;
}

/** Whether the judge is consulted on this rung at all. */
export const watched = (rung: Rung): rung is Watched =>
	rung === "notice" || rung === "midpoint";

/** Where a measurement leaves the context on the watcher's ladder. */
export function rungAt(tokens: number, limits: Thresholds): Rung {
	if (tokens >= limits.urgent) {
		return "urgent";
	}

	if (tokens < limits.notice) {
		return "none";
	}

	return tokens >= (limits.notice + limits.urgent) / 2 ? "midpoint" : "notice";
}

/**
 * How many turns a wait comes to. `later` is halved past the midpoint, so the
 * longest wait cannot spend the last of the room between the two thresholds.
 */
export const waitTurns = (wait: Wait, rung: Rung): number =>
	wait === "later" && rung === "midpoint" ? 4 : TURNS[wait];

/**
 * Whether the turn landed something the session could be cut at whatever a
 * wait says: a task marked completed, a commit, or a push. Each is written
 * plainly in the transcript, and each is the sort of thing the arc rule calls
 * the end of an arc. No other shape is read as one, since what an arc is is the
 * judge's to say, and a hook guessing it from surface form is the detector this
 * design was chosen over.
 */
export const landed = (turn: Turn): boolean => turn.called.some(lands);

/**
 * `git commit` and `git push` wherever they stand in the command, since a
 * landing is as often the second half of `git add -A && git commit` as a
 * command of its own, and `-C <dir>` is the one flag that comes between.
 * A command that only mentions one, `echo git push`, is read as a landing too:
 * what that costs is one judge call, and the wording a real landing takes is
 * not worth guessing at from here.
 */
const GIT_LANDING = /\bgit\s+(?:-C\s+\S+\s+)?(commit|push)\b/;

const lands = (use: ToolUse): boolean =>
	use.name === "TaskUpdate"
		? use.input["status"] === "completed"
		: use.name === "Bash" &&
			GIT_LANDING.test(String(use.input["command"] ?? ""));

/**
 * The state as this turn leaves it, which is the state the gate reads. Two
 * things end what the record holds.
 *
 * A context this was not written in is one the judge never saw: a compaction
 * or a rewind has taken the prompts it read out of the session, so the verdict
 * is about nothing and the wait was measured against turns that are gone. The
 * count alone cannot tell that, since a rebuilt context reaches the same rung
 * again with more of the user's prompts in it than the old one ever had; it is
 * read beside the context because a rewind that drops prompts without leaving
 * a boundary behind leaves the oldest one where it was.
 *
 * A verdict is over once the context climbs off the rung it was judged on or
 * the turn lands something, which is the silence the design asks for after
 * advice the session declined: the coordinator never says that it declined, so
 * a new signal is the only thing that can reopen the question.
 */
export function standing(state: WatcherState, turned: Turned): WatcherState {
	if (turned.context !== state.context || turned.count < state.turn) {
		return FRESH;
	}

	const { verdict } = state;
	const stands =
		verdict !== null && verdict.rung === turned.rung && !turned.landing;

	return stands ? state : { ...state, verdict: null };
}

/**
 * Whether the judge is consulted on this turn, read cheapest first. `state` is
 * the state with `standing` already applied, so a verdict left in it is one
 * that closes the gate.
 *
 * @param boundMs - how long a judge call may run. A marker older than that
 *   belongs to a run that died holding it, and is no run in flight.
 */
export function consults(
	state: WatcherState,
	turned: Turned,
	now: number,
	boundMs: number,
): boolean {
	if (state.verdict !== null) {
		return false;
	}

	if (now - state.startedAt < boundMs) {
		return false;
	}

	return turned.landing || turned.count >= state.next;
}

/**
 * Where the judge's answer leaves the watcher: a verdict standing, or a wait.
 * It is here rather than beside the call because what it writes is what
 * `standing` and `consults` read back on the next Stop, and the three only
 * agree while they are read together.
 */
export function settled(
	state: WatcherState,
	turned: Judged,
	answer: Answer,
): WatcherState {
	const after: WatcherState = {
		...state,
		turn: turned.count,
		context: turned.context,
		startedAt: 0,
	};

	// The verdict is the whole of what holds the gate shut from here, so the wait
	// booked before it is spent with it: a wait still counting down would go on
	// refusing the judge after a rung climb or a landing had dropped the verdict.
	if (answer.kind === "good") {
		return {
			...after,
			next: turned.count,
			verdict: { rung: turned.rung, option: answer.option },
		};
	}

	// Nothing usable came back, so the longest wait: a judge that cannot answer
	// on this machine is one every turn would otherwise spend a call on.
	const wait = answer.kind === "wait" ? answer.wait : "later";

	return { ...after, next: turned.count + waitTurns(wait, turned.rung) };
}

/** The watcher's fields as the record holds them, narrowed on the way out. */
export function watcherIn(written: unknown): WatcherState {
	const fields = fieldsOf(written);

	return {
		turn: countIn(fields["turn"]),
		context: nameIn(fields["context"]),
		next: countIn(fields["next"]),
		startedAt: countIn(fields["startedAt"]),
		verdict: verdictIn(fields["verdict"]),
	};
}

/** A context as the file spells it, and no context for anything that is none. */
const nameIn = (value: unknown): string =>
	typeof value === "string" ? value : "";

const countIn = (value: unknown): number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

/**
 * A verdict left half written, by a run that died between the two fields,
 * reads as no verdict: what the gate is holding open or shut is not a thing to
 * infer from half a record. A rung the judge is never consulted on reads the
 * same way, since no run of this can have written one.
 */
function verdictIn(written: unknown): Verdict | null {
	const fields = fieldsOf(written);
	const option = optionIn(fields["option"]);
	const rung = RUNGS.find((known) => known === fields["rung"]);

	return option === null || rung === undefined || !watched(rung)
		? null
		: { rung, option };
}
