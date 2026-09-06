// What the session's record lists while a fault stands, how a listing goes on
// being heard, and what it takes to have one taken back: the same line again on
// every tenth prompt it has stood for, said by whichever entry the prompt runs
// through, and one line when a run that answers for it works again. `fault.mts`
// words the reports and hands them here.
//
// A reminder reads the record back; a recovery claims something about the run
// making it, so which runs answer for which listing is what this file turns on.
// There are no stand-in values behind either: an entry that cannot do its job
// says so, and goes on saying so for as long as it cannot.
import process from "node:process";
import type { Fault, FaultClass } from "./fault.mts";
import { fieldsOf, isTable } from "./fields.mts";
import {
	type Done,
	LEFT_AFTER_CONFIG,
	LEFT_BEFORE_CONFIG,
	type Run,
} from "./run.mts";
import type { Change, SessionState } from "./session-state.mts";

/** How many prompts pass between one report of a standing fault and the next. */
const EVERY = 10;

/**
 * The faults this session has been told about, listed in its record under the
 * listings below. The plugin's own fields share that record, so anything that
 * is not a table of them reads as nothing listed.
 */
const REPORTED = "reported";

/** What the record keeps about a fault the session has been told about. */
interface Listing {
	/** The line the session heard, which is the line a reminder repeats. */
	readonly said: string;
	/** How many of this session's prompts it has stood through. */
	readonly prompts: number;
}

/** What a run that met no fault has to say. */
export interface Recovery {
	/**
	 * One line per listing this run found gone, for the user to read, and
	 * nothing for a run that found none. A listing is dropped from the record
	 * as it is named, so the same fault later is a first report again.
	 */
	readonly announced: readonly string[];
	/**
	 * One line per listing the record still holds that has stood another ten
	 * prompts, worded as the session first heard it.
	 */
	readonly standing: readonly string[];
}

/**
 * The classes every entry of a plugin answers for, because they all read one
 * configuration file through one parser: getting past both is evidence
 * whichever entry reported them. Every other class is one entry's own run
 * coming apart, which only that entry reaching the end again says anything
 * about, and that is the safe way round for any class added later.
 */
const SHARED = new Set<string>(["parser", "config"] satisfies FaultClass[]);

const CONFIG: FaultClass = "config";

/**
 * What a listing is filed under. One listing holds a shared class, since any
 * entry's report of one is the same news to the session; every other class is
 * listed per entry, or one entry crashing after another had listed `internal`
 * would leave the second crash unsaid and taken back by a run that never went
 * near it.
 */
const keyFor = (cls: string, entry: string): string =>
	SHARED.has(cls) ? cls : `${cls}:${entry}`;

/** The class a key was made from, which is what a recovery line names. */
const classOf = (key: string): string => key.split(":")[0] ?? key;

/**
 * Whether a run ending well is evidence that the listing at `key` is over.
 * A run that left on its input has met nothing at all; one that left after the
 * configuration has proved the file readable and usable, and nothing about the
 * parser it may never have needed or the work it did not do; one that did its
 * work has met everything its own entry can meet.
 */
function answersFor(run: Run, reached: Done, key: string): boolean {
	if (reached === LEFT_BEFORE_CONFIG) {
		return false;
	}

	if (reached === LEFT_AFTER_CONFIG) {
		return key === CONFIG;
	}

	return keyFor(classOf(key), run.entry) === key;
}

/**
 * Says the fault and whatever else has stood another ten prompts, or leaves
 * the session alone: false says nothing was written.
 */
export function report(state: SessionState, run: Run, fault: Fault): boolean {
	let lines: readonly string[] = [fault.message];

	// No session id is no session to record against: one record shared by every
	// such run on the machine would silence all but the first of them.
	if (run.session !== "") {
		// Whether the fault is listed, the count a reminder of it is due on and
		// the listing itself are one step under the record's lock, since two
		// hooks of one session run at once.
		const said = state.update(run.session, (record) =>
			standing(record, run, fault),
		);

		// A run that never got the lock has no answer to go on, and one whose
		// write did not land has an answer nothing kept: either way what is
		// lost is the silence, and saying it every time beats never saying it.
		if (said.held) {
			lines = said.result;
		}
	}

	for (const line of lines) {
		process.stderr.write(`${line}\n`);
	}

	return lines.length > 0;
}

/**
 * What this run says about `fault`, and what that leaves in the record. A
 * fault the record does not hold is said and listed; one it holds already is
 * left to the reminders, which this run makes like any other. A prompt run
 * counts itself against every listing, since prompts are what a fault is
 * measured as standing through.
 */
function standing(
	record: Record<string, unknown>,
	run: Run,
	fault: Fault,
): Change<readonly string[]> {
	const key = keyFor(fault.cls, run.entry);
	const listed = stood(listingsIn(record), run);
	const first = firstReport(listed[key], fault);

	if (first) {
		listed[key] = { said: fault.message, prompts: run.prompt ? 1 : 0 };
	}

	return {
		fields: first || run.prompt ? { [REPORTED]: listed } : null,
		result: [...(first ? [fault.message] : []), ...reminders(listed, run)],
	};
}

/** Every listing there is, with this run counted where it is a prompt. */
const stood = (
	listed: Readonly<Record<string, Listing>>,
	run: Run,
): Record<string, Listing> =>
	Object.fromEntries(
		Object.entries(listed).map(([key, listing]) => [
			key,
			{ ...listing, prompts: listing.prompts + (run.prompt ? 1 : 0) },
		]),
	);

/**
 * Whether this run is the first the session hears of this fault. A listing
 * whose line has changed is a second mistake standing behind the first: the
 * user who fixed the key a report named has another to be told about, and a
 * reminder quoting the line they have already dealt with would send them back
 * to it.
 *
 * Only the shared classes are compared that way, because their wording is a
 * reading of the file and changes when the file does. An `internal` line is
 * whatever an unforeseen error carried, which nothing here can promise is the
 * same line on the next run, and a line that differed every time would be a
 * report on every tool call.
 */
const firstReport = (listed: Listing | undefined, fault: Fault): boolean =>
	listed === undefined ||
	(SHARED.has(fault.cls) && listed.said !== fault.message);

/**
 * The listings this run says again, worded as the session heard them first. A
 * reminder is a reading of the record rather than a claim about this run, so it
 * covers what another entry listed too: whichever entry met it, the session is
 * living with it still.
 *
 * Prompts rather than minutes, and nothing attests that ten of them is the
 * right distance: what a standing fault costs is a context nobody is watching,
 * and a context grows by the turn rather than by the clock. The repeat is also
 * the only standing indicator this can have, since a plugin has nowhere on the
 * screen to keep one. Only a prompt run makes one, or a turn heavy with tool
 * calls would say the same line twenty times.
 */
function reminders(
	listed: Readonly<Record<string, Listing>>,
	run: Run,
): readonly string[] {
	if (!run.prompt) {
		return [];
	}

	const lines: string[] = [];

	for (const listing of Object.values(listed)) {
		// A listing with no line to repeat is one a run left half written. It
		// stands, and the session hears about it when a run meets the fault.
		if (
			listing.said !== "" &&
			listing.prompts > 0 &&
			listing.prompts % EVERY === 0
		) {
			lines.push(`${listing.said} Standing for ${listing.prompts} prompts.`);
		}
	}

	return lines;
}

const NOTHING: Recovery = { announced: [], standing: [] };

/**
 * What a run that met no fault has for the user. Called by every such run;
 * only a prompt run with something listed answers with anything.
 */
export function recovered(
	state: SessionState,
	plugin: string,
	run: Run,
	reached: Done,
): Recovery {
	if (!run.prompt || run.session === "") {
		return NOTHING;
	}

	// A prompt of a session that has been told nothing has nothing to take
	// back and nothing to count, and it says so without the lock rather than
	// taking one on every healthy prompt of the session. A listing written
	// between this read and here belongs to a run that has just said its line
	// anyway, which is the same tolerance a lost lock gets below.
	if (Object.keys(listingsIn(state.read(run.session))).length === 0) {
		return NOTHING;
	}

	const cleared = state.update(run.session, (record) => {
		const over: string[] = [];
		const kept: Record<string, Listing> = {};

		// One record holds every entry of the plugin, so a listing another
		// entry made is taken back here when this run's work covers it too, and
		// left standing when it does not.
		for (const [key, listing] of Object.entries(listingsIn(record))) {
			if (answersFor(run, reached, key)) {
				over.push(classOf(key));
			} else {
				kept[key] = { ...listing, prompts: listing.prompts + 1 };
			}
		}

		return {
			fields: {
				[REPORTED]: Object.keys(kept).length === 0 ? undefined : kept,
			},
			// What is left is what this run is reminded of: a listing it has
			// just taken back is over, not standing.
			result: { over, standing: reminders(kept, run) },
		};
	});

	// A run that never got the lock cleared nothing and knows nothing, so it
	// says nothing: the next prompt is the one that finds the fault gone.
	if (!cleared.held) {
		return NOTHING;
	}

	const { over, standing } = cleared.result;

	return { announced: over.map((cls) => gone(plugin, cls)), standing };
}

/** How a class the session was told about is said to be over. */
const gone = (plugin: string, cls: string): string =>
	`${plugin}: the ${cls} error is gone; on again for this session.`;

/** Each fault the session has been told about, against the key it is under. */
function listingsIn(
	record: Record<string, unknown>,
): Readonly<Record<string, Listing>> {
	const listed = record[REPORTED];
	const marks: Record<string, Listing> = {};

	// A record written by an earlier release lists the classes in an array,
	// which is no table of listings and reads as nothing listed: a session that
	// spans the upgrade hears its fault again as a first report.
	if (isTable(listed)) {
		for (const [key, mark] of Object.entries(listed)) {
			const fields = fieldsOf(mark);

			// A listing missing its fields is one a run left half written. It
			// reads as heard in words nobody kept and as having stood through no
			// prompt of this session: there is nothing to remind anyone of until
			// a run meets the fault again, and the first run that answers for it
			// takes it back.
			marks[key] = {
				said: String(fields["said"] ?? ""),
				prompts: countIn(fields["prompts"]),
			};
		}
	}

	return marks;
}

const countIn = (written: unknown): number =>
	typeof written === "number" && Number.isInteger(written) && written >= 0
		? written
		: 0;
