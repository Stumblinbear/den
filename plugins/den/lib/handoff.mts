// The handoff: the question the coordinator asks before coupled
// implementation, and what each of its three answers means for the context.
//
// The header and labels are matched by the switch hook and written by the
// handoff-cost skill, so they live here once and a test holds the skill text
// to them.
import {
	askedAnswer,
	type Compacted,
	type Entry,
	isCompaction,
	isUserPrompt,
	type Turn,
} from "./transcript.mts";

/** The AskUserQuestion header that marks the handoff question. */
export const HANDOFF_HEADER = "Handoff";

export const FORK = "Fork";
export const SWITCH = "Switch model";
export const BRIEF = "Brief an implementer";

/**
 * Whether a model switch right now is the user carrying out a standing
 * Switch answer. Reads the entries newest first: the first thing the user
 * did after the question decides. A prompt typed since means the answer was
 * overtaken, a different question asked since means this switch is about
 * something else, and a compaction means the exchange is no longer in
 * context.
 *
 * What invoked the switch is not read: the answer said switch, and the
 * switch happened.
 */
export function standingSwitch(entries: readonly Entry[]): boolean {
	for (const entry of entries) {
		if (isCompaction(entry) || isUserPrompt(entry)) {
			return false;
		}

		const asked = askedAnswer(entry);

		if (asked === null) {
			continue;
		}

		const handoff = asked.questions.find((q) => q.header === HANDOFF_HEADER);

		// By prefix: a label the coordinator suffixed, "(Recommended)" being
		// the habit, is still this answer.
		return (
			handoff !== undefined &&
			(asked.answers[handoff.question] ?? "").startsWith(SWITCH)
		);
	}

	return false;
}

/** What the switch hook adds to the context when a Switch answer stands. */
export const switchGo = (model: string): string =>
	[
		`The user answered "${SWITCH}" on the ${HANDOFF_HEADER} question and has switched this session to ${model}.`,
		"That is the go: implement inline now, in this session, under the pinned",
		"design, and report the way an implementer reports (choices made, questions,",
		"anything left undone).",
	].join(" ");

/**
 * The reading the skill arrives with: what each answer carries of the
 * current context, as cache-miss token counts. Only context reads are
 * priced; what the implementation will write is unknown here.
 */
export function reading(state: Turn | Unknown, wanted: string): string {
	const target = targetOf(wanted) ?? DEFAULT_TARGET;
	const head =
		state.kind === "unknown"
			? `Context size unknown: ${state.why}. Unpriced:`
			: `Context now: ${tokens(state.tokens)} tokens on ${state.model}.`;
	const note =
		targetOf(wanted) === null && wanted.trim() !== ""
			? [
					`Target "${wanted.trim()}" names no model; the switch row is priced for ${DEFAULT_TARGET}.`,
				]
			: [];
	const priced =
		state.kind === "unknown"
			? rows(null, "the current model", target)
			: rows(state.tokens, state.model, target);

	return [head, ...note, "", ...priced].join("\n");
}

/** What the switch row is priced for when nothing names a target. */
const DEFAULT_TARGET = "opus";

/**
 * The model a target names, or null. `/model` takes an alias (`opus`,
 * `sonnet`, `haiku`, `fable`) or a full id, so those are the shapes; anything
 * else is an argument mistaken for one, and the reading says so rather than
 * pricing it.
 */
const targetOf = (wanted: string): string | null => {
	const target = wanted.trim().toLowerCase();

	return /^[a-z]+$/.test(target) || target.startsWith("claude-")
		? target
		: null;
};

/** No size to quote, and the reason, which the reading says. */
export interface Unknown {
	readonly kind: "unknown";
	readonly why: string;
}

export const unknown = (why: string): Unknown => ({ kind: "unknown", why });

/** The newest turn as the reading takes it, with the reason when there is none. */
export function measuredFrom(
	measured: Turn | Compacted | null,
): Turn | Unknown {
	if (measured === null) {
		return unknown("no turn was found in the transcript's tail");
	}

	return measured.kind === "compacted"
		? unknown(
				"the context was just compacted and no turn has measured the result",
			)
		: measured;
}

function rows(
	size: number | null,
	model: string,
	target: string,
): readonly string[] {
	const all = size === null ? "the whole context" : tokens(size);
	const miss = size === null ? "the whole context" : `${tokens(size)} tokens`;
	const switchRow = isModel(model, target)
		? `${SWITCH} (to ${target}): already on ${model}, so there is no switch to make; this answer means implement inline now.`
		: `${SWITCH} (to ${target}): cache miss ${miss}, written once by the first turn on ${target}; later turns there read it cached.`;

	return [
		`${FORK} (stays on ${model}): cache miss 0. The fork's first request reads ${all} from the cache and writes only its instruction; each fork turn re-reads it cached. This context stays as it is.`,
		switchRow,
		`${BRIEF}: cache miss 0. Nothing of this context is carried; the implementer starts from the brief alone.`,
		"",
		"Priced: context reads only. Output tokens and usage-limit weighting per model are not, and output is what an implementation mostly spends.",
	];
}

/**
 * Whether a model id is the one a target names. A target is what `/model`
 * takes: an alias such as `opus`, which the id carries as one of its
 * dash-separated parts (`claude-opus-5`), or a full id.
 */
const isModel = (id: string, target: string): boolean => {
	const alias = target.trim().toLowerCase();

	return (
		alias !== "" &&
		(id.toLowerCase() === alias || id.toLowerCase().split("-").includes(alias))
	);
};

const tokens = (n: number): string => n.toLocaleString("en-US");
