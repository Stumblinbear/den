// Stop hook, registered async. Once the session is past the notice threshold
// it asks a small model, on the turn's own transcript and the priced reading,
// whether the session has just reached a good moment to shrink its context,
// and writes what comes back as its own advice: Claude Code hands an async
// hook's `additionalContext` to the model on the next conversation turn, which
// is the first moment after this one that the session can hear anything.
//
// It advises and never acts, so everything it can get wrong costs a sentence
// the coordinator may decline. The gate is read cheapest first and the judge
// paces itself, so most Stops here are one measurement and one turn read.
//
// Subagents are out of scope, as they are short-lived and cannot compact.
import process from "node:process";
import { argValue } from "../lib/args.mts";
import { cacheReading } from "../lib/cache-reading.mts";
import {
	type Answer,
	askJudge,
	JUDGE_DEAD_MS,
	judgePrompt,
} from "../lib/judge.mts";
import { measure } from "../lib/measure.mts";
import { WATCHER_FAULTS } from "../lib/plugin.mts";
import { loadPricing } from "../lib/pricing.mts";
import { scanCacheWindow } from "../lib/prompt-cache.mts";
import { latestTurn, recentTurns, type Turn } from "../lib/recent-turns.mts";
import { opening } from "../lib/rewind-picker.mts";
import { updateRecord } from "../lib/session-record.mts";
import {
	loadSettings,
	type Settings,
	type Thresholds,
	thresholdsFor,
	type Watcher,
} from "../lib/settings.mts";
import { injected, runEntry } from "../lib/shared/entry.mts";
import { ifPresent } from "../lib/transcript.mts";
import {
	consults,
	type Judged,
	landed,
	rungAt,
	settled,
	standing,
	watched,
} from "../lib/watcher.mts";

/** The event `hooks.json` registers this entry on, and no other. */
const EVENT = "Stop";

const args = process.argv.slice(2);

/** The turn that has just ended, as everything below it reads that turn. */
interface Ended extends Judged {
	readonly tokens: number;
	readonly limits: Thresholds;
	/** The newest turn, which is the one a verdict is about. */
	readonly newest: Turn;
}

/**
 * The turn as the gate reads it, and null where there is nothing to gate: a
 * transcript with no turn in it, a compaction newer than any turn, a model
 * with no thresholds to be past, or a rung the judge is never consulted on.
 * The turn is read only past that last check, since the walk it takes is the
 * dearest thing this hook does on a quiet session.
 */
function ended(transcript: string, settings: Settings): Ended | null {
	const measured = measure(transcript);

	if (measured === null || measured.kind !== "turn") {
		return null;
	}

	const limits = thresholdsFor(settings, measured.model);

	if (limits === null) {
		return null;
	}

	const rung = rungAt(measured.tokens, limits);

	if (!watched(rung)) {
		return null;
	}

	const latest = latestTurn(transcript);

	return latest.turn === null
		? null
		: {
				tokens: measured.tokens,
				limits,
				rung,
				count: latest.count,
				context: latest.context,
				landing: landed(latest.turn),
				newest: latest.turn,
			};
}

/**
 * The turn's count written into the record, a verdict dropped where it has
 * stopped standing, and the in-flight marker claimed where the judge is to be
 * consulted. True says this run holds that marker and is to make the call.
 *
 * All of it is one change under the lock, because the gate is read out of the
 * record and the claim is written back into it: two Stops of one session that
 * each read before either wrote would both call the judge.
 */
function claimed(session: string, turn: Ended): boolean {
	const claim = updateRecord(session, (before) => {
		const now = Date.now();
		const state = standing(before.watcher, turn);
		const judging = consults(state, turn, now, JUDGE_DEAD_MS);

		return {
			fields: {
				watcher: {
					...state,
					turn: turn.count,
					context: turn.context,
					startedAt: judging ? now : state.startedAt,
				},
			},
			result: judging,
		};
	});

	// A run that could not take the lock changes nothing and calls nothing: the
	// next Stop reads a record no worse than this one left it.
	return claim.held && claim.result;
}

/**
 * The judge's answer written back, and the marker released whatever it says. A
 * run that could not take the lock here loses the answer and leaves the marker
 * standing, which the next Stop past the marker's own age reads as a run that
 * died and starts again from.
 */
function answered(session: string, turn: Ended, answer: Answer): void {
	updateRecord(session, (before) => ({
		fields: { watcher: settled(before.watcher, turn, answer) },
		result: null,
	}));
}

/**
 * Whether the answer was the session's to hear. A call runs for as long as
 * minutes, and a compaction or a rewind inside one leaves both the answer and
 * the wait it would book about a conversation that is gone: the marker is
 * released, nothing else is written, and the next Stop starts over from the
 * context there now. A transcript no longer at the path it was named at is
 * read as gone, which is what it is.
 */
function recorded(
	session: string,
	transcript: string,
	turn: Ended,
	answer: Answer,
): boolean {
	if (ifPresent(() => latestTurn(transcript).context) !== turn.context) {
		released(session);

		return false;
	}

	answered(session, turn, answer);

	return true;
}

/** The marker released, on a turn the judge was never asked anything. */
function released(session: string): void {
	updateRecord(session, (before) => ({
		fields: { watcher: { ...before.watcher, startedAt: 0 } },
		result: null,
	}));
}

/**
 * The prompt for this turn, and null where the transcript moved under the read
 * that builds it. The transcript is read once more here for the priced
 * reading, which is the same text the cut-point script prints and the same
 * figures the coordinator would be shown.
 */
async function prompted(
	transcript: string,
	turn: Ended,
	watcher: Watcher,
): Promise<string | null> {
	const pricing = await loadPricing({
		shipped: argValue(args, "--pricing"),
		overrides: argValue(args, "--pricing-overrides"),
	});

	return ifPresent(() =>
		judgePrompt(
			cacheReading(scanCacheWindow(transcript), pricing),
			recentTurns(transcript, watcher.tailTurns),
			{ tokens: turn.tokens, limits: turn.limits },
			watcher.tailTokens,
		),
	);
}

/**
 * What a cut is owed, carried by the line itself: it arrives many turns after
 * any skill was loaded, and a recommendation left inside a paragraph was
 * never seen.
 */
const RELAY = [
	"Put that to the user in your next reply, the command in a fenced block on",
	"its own line at the end, since a recommendation inside a paragraph is one",
	"they never see. If the work in hand should finish first, say so beside it,",
	"and raise it again at each later pause where a cut would keep what the work",
	"still needs, with a command written for that moment from the",
	"`context-budget:cut-point` skill, until the user runs one or says they want",
	"none.",
].join(" ");

/**
 * What the session is told: where the judge looked, what it recommends and
 * why, and what a cut is owed. The reason is the judge's own sentence, since
 * advice a coordinator cannot weigh is an instruction.
 */
const advice = (
	answer: Extract<Answer, { kind: "good" }>,
	where: string,
): string =>
	[
		`Context watcher: after the turn that began "${where}", the arc looked over: ${answer.reason}.`,
		`It recommends ${recommendation(answer)}.`,
		...(answer.option === "carry-on" ? [] : [RELAY]),
	].join(" ");

const recommendation = (answer: Extract<Answer, { kind: "good" }>): string => {
	if (answer.option === "carry-on") {
		return "carrying on unchanged";
	}

	return answer.option === "compact"
		? `\`/compact ${answer.focus}\``
		: `a rewind summarize at "${answer.focus}"`;
};

// The run itself, last in the file and below every binding it reads: a `const`
// read from here before its own declaration throws a ReferenceError.
await runEntry(
	{ faults: WATCHER_FAULTS },
	async ({ input, session, event }) => {
		// Without a session id there is no record to pace the judge by.
		if (event !== EVENT || session === "") {
			return null;
		}

		const settings = await loadSettings(args);

		// The main session: a subagent's input names the agent it is for.
		if (settings === null || !settings.watcher.enabled || input["agent_id"]) {
			return null;
		}

		const transcript = input["transcript_path"];

		if (typeof transcript !== "string" || transcript === "") {
			return null;
		}

		const watcher = settings.watcher;
		// A moved transcript is silence, and every other read failure stops the
		// run: a bug in the reader passing for a quiet turn would make a watcher
		// that reads nothing look like one with nothing to say.
		const turn = ifPresent(() => ended(transcript, settings));

		if (turn === null || !claimed(session, turn)) {
			return null;
		}

		const prompt = await prompted(transcript, turn, watcher);

		if (prompt === null) {
			released(session);

			return null;
		}

		const answer = askJudge(watcher, prompt);
		const kept = recorded(session, transcript, turn, answer);

		// Thrown on every consult, because a judge that failed this turn fails
		// the next one too, and the session is owed the reason its watcher has
		// gone quiet. An answer the session kept books a wait against the same
		// command, which is what paces the repeat. The fix names the command
		// rather than the failure: a mistyped word and a model refusing the call
		// are both answered by editing that key or by switching the watcher off.
		if (answer.kind === "fault") {
			throw WATCHER_FAULTS.fault(
				"internal",
				answer.detail,
				`change \`[watcher] command\` in ${argValue(args, "--config") ?? ""}, or switch the watcher off with \`[watcher] enabled = false\``,
			);
		}

		return kept && answer.kind === "good"
			? injected(event, advice(answer, opening(turn.newest.asked)))
			: null;
	},
);
