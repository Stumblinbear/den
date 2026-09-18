// What resuming a subagent would cost, read from its own transcript: how much
// context every turn would re-read, and whether the prompt cache that made
// those turns cheap has expired.
//
// The two are read off different turns. The context and the time come from the
// newest turn it took; the lifetime comes from the newest turn that wrote to
// the cache, which is not always the same one: a request served entirely from
// a warm cache writes nothing back and records no split.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fieldsOf } from "./shared/fields.mts";
import {
	type CacheTtl,
	conversationEntries,
	DEFAULT_TTL,
	ifPresent,
	inputTokens,
	lifetimeIn,
	lifetimeMs,
	newestFirst,
	turnModel,
	turnUsage,
} from "./transcript.mts";

export interface Resumed {
	/** The id its transcript and its launch records are written under. */
	readonly id: string;
	/** The agent type it was launched as, or "subagent" when none is recorded. */
	readonly type: string;
	/**
	 * The model its newest turn was sent to, and the empty string for a turn
	 * that names none, which matches no row written for a model.
	 */
	readonly model: string;
	readonly context: number;
	readonly ttl: CacheTtl;
	readonly idleMs: number;
	readonly cacheExpired: boolean;
}

/** The newest turn of a subagent's transcript, and the lifetime in force. */
interface ResumeState {
	readonly last: Record<string, unknown>;
	readonly usage: Record<string, unknown>;
	/** Null where no turn in the transcript ever wrote to the cache. */
	readonly lifetime: CacheTtl | null;
}

/** Null when this session has no such subagent, or none that has ever spoken. */
export function resumedAgent(transcript: string, to: string): Resumed | null {
	const dir = join(transcript.replace(/\.jsonl$/, ""), "subagents");
	const id = agentId(transcript, dir, to);

	if (id === null) {
		return null;
	}

	const state = resumeState(join(dir, `agent-${id}.jsonl`));

	if (state === null) {
		return null;
	}

	// A transcript in which no turn ever wrote to the cache says nothing about
	// the lifetime, so the guard falls back to the API's own default here, at
	// the one place that has to know it is a guess.
	const ttl = state.lifetime ?? DEFAULT_TTL;
	// NaN for a timestamp that will not parse, which compares false against the
	// lifetime below: an unreadable clock is not evidence of a cold cache.
	const idleMs = Date.now() - Date.parse(String(state.last["timestamp"]));

	return {
		id,
		type: agentType(dir, id),
		model: turnModel(state.last),
		context: inputTokens(state.usage),
		ttl,
		idleMs,
		cacheExpired: idleMs > lifetimeMs(ttl),
	};
}

function resumeState(file: string): ResumeState | null {
	const text = ifPresent(() => readFileSync(file, "utf8"));

	if (text === null) {
		return null;
	}

	const lines = text.split("\n");

	for (const entry of newestFirst(lines)) {
		if (entry["type"] !== "assistant") {
			continue;
		}

		const usage = turnUsage(entry);

		if (usage !== null) {
			return { last: entry, usage, lifetime: lifetimeIn(newestFirst(lines)) };
		}
	}

	return null;
}

/**
 * The id of the agent a message to `to` reaches, and null where this session
 * has none.
 *
 * Claude Code takes an id or a name in `to`, and where several agents carry one
 * name the message reaches the one launched last.
 */
function agentId(transcript: string, dir: string, to: string): string | null {
	if (existsSync(join(dir, `agent-${to}.jsonl`))) {
		return to;
	}

	const named = (ifPresent(() => readdirSync(dir)) ?? [])
		.map((file) => file.match(/^agent-(.+)\.meta\.json$/)?.[1])
		.filter((id) => id !== undefined)
		.filter((id) => metaOf(dir, id)["name"] === to);

	return named.length <= 1
		? (named[0] ?? null)
		: lastStarted(transcript, named);
}

/**
 * Which of `ids` the session launched or resumed last, by its own records, and
 * null where no record names any of them or the session transcript is gone.
 */
function lastStarted(
	transcript: string,
	ids: readonly string[],
): string | null {
	return ifPresent(() => {
		for (const entry of conversationEntries(transcript)) {
			const record = fieldsOf(entry["toolUseResult"]);

			for (const key of ["agentId", "resumedAgentId"]) {
				const id = record[key];

				if (typeof id === "string" && ids.includes(id)) {
					return id;
				}
			}
		}

		return null;
	});
}

/**
 * The metadata Claude Code wrote beside an agent's transcript, and empty where
 * there is no such file or it will not parse.
 */
function metaOf(dir: string, id: string): Record<string, unknown> {
	try {
		return fieldsOf(
			JSON.parse(readFileSync(join(dir, `agent-${id}.meta.json`), "utf8")),
		);
	} catch {
		return {};
	}
}

/** The agent type in the metadata file, and "subagent" where it names none. */
function agentType(dir: string, id: string): string {
	const meta = metaOf(dir, id);

	for (const key of ["agentType", "agent_type", "subagentType"]) {
		const value = meta[key];

		if (typeof value === "string" && value !== "") {
			return value;
		}
	}

	return "subagent";
}
