// What resuming a subagent would cost, read from its own transcript: how much
// context every turn would re-read, and whether the prompt cache that made
// those turns cheap has expired.
//
// The two are read off different turns. The context and the time come from the
// newest turn it took; the lifetime comes from the newest turn that wrote to
// the cache, which is not always the same one: a request served entirely from
// a warm cache writes nothing back and records no split.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fieldsOf } from "./shared/fields.mts";
import {
	type CacheTtl,
	cacheLifetime,
	DEFAULT_TTL,
	ifPresent,
	inputTokens,
	lifetimeMs,
	newestFirst,
	turnUsage,
} from "./transcript.mts";

export interface Resumed {
	/** The agent type it was launched as, or "subagent" when none is recorded. */
	readonly type: string;
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
	const state = resumeState(join(dir, `agent-${to}.jsonl`));

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
		type: agentType(dir, to),
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

	let last: {
		entry: Record<string, unknown>;
		usage: Record<string, unknown>;
	} | null = null;

	for (const entry of newestFirst(text.split("\n"))) {
		if (entry["type"] !== "assistant") {
			continue;
		}

		const usage = turnUsage(entry);

		if (usage === null) {
			continue;
		}

		last ??= { entry, usage };

		const lifetime = cacheLifetime(usage);

		if (lifetime !== null) {
			return { last: last.entry, usage: last.usage, lifetime };
		}
	}

	return last === null
		? null
		: { last: last.entry, usage: last.usage, lifetime: null };
}

function agentType(dir: string, to: string): string {
	let meta: Record<string, unknown>;

	try {
		meta = fieldsOf(
			JSON.parse(readFileSync(join(dir, `agent-${to}.meta.json`), "utf8")),
		);
	} catch {
		// No meta file, or one that will not parse: the deny reason then says
		// "subagent", which is true of everything it can be sent to.
		return "subagent";
	}

	for (const key of ["agentType", "agent_type", "subagentType"]) {
		const value = meta[key];

		if (typeof value === "string" && value !== "") {
			return value;
		}
	}

	return "subagent";
}
