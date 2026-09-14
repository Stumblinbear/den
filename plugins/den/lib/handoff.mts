// The handoff: the question the lead asks before coupled
// implementation, and what each of its two answers means for the context.
//
// The labels are written by the handoff-cost skill and carried by the
// reading's rows, so they live here once and a test holds the skill to them.
import type { Compacted, Turn } from "./transcript.mts";

/** The AskUserQuestion header that marks the handoff question. */
export const HANDOFF_HEADER = "Handoff";

export const FORK = "Fork";
export const BRIEF = "Brief an implementer";

/**
 * The reading the skill arrives with: what each answer carries of the
 * current context, as cache-miss token counts. Only context reads are
 * priced; what the implementation will write is unknown here.
 */
export function reading(state: Turn | Unknown): string {
	const head =
		state.kind === "unknown"
			? `Context size unknown: ${state.why}. Unpriced:`
			: `Context now: ${tokens(state.tokens)} tokens on ${state.model}.`;
	const priced =
		state.kind === "unknown"
			? rows(null, "the current model")
			: rows(state.tokens, state.model);

	return [head, "", ...priced].join("\n");
}

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

function rows(size: number | null, model: string): readonly string[] {
	const all = size === null ? "the whole context" : tokens(size);

	return [
		`${FORK} (stays on ${model}): cache miss 0. The fork's first request reads ${all} from the cache and writes only its instruction; each fork turn re-reads it cached. This context stays as it is.`,
		`${BRIEF}: cache miss 0. Nothing of this context is carried; the implementer starts from the brief alone.`,
		"",
		"Priced: context reads only. Output tokens and usage-limit weighting per model are not, and output is what an implementation mostly spends.",
	];
}

const tokens = (n: number): string => n.toLocaleString("en-US");
