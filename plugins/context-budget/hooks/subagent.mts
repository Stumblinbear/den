// What resuming a subagent would cost, read from the newest assistant turn of
// its own transcript: how much context every turn would re-read, and whether
// the prompt cache that made those turns cheap has expired.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fieldsOf, isTable } from "../lib/fields.mts";
import { count, ifPresent, inputTokens, newestFirst } from "./transcript.mts";

/** The prompt-cache lifetime a turn was billed under, as a message names it. */
export type CacheTtl = "5m" | "1h";

export interface Resumed {
	/** The agent type it was launched as, or "subagent" when none is recorded. */
	readonly type: string;
	readonly context: number;
	readonly ttl: CacheTtl;
	readonly idleMs: number;
	readonly cacheExpired: boolean;
}

/** Null when this session has no such subagent, or none that has ever spoken. */
export function resumedAgent(transcript: string, to: string): Resumed | null {
	const dir = join(transcript.replace(/\.jsonl$/, ""), "subagents");
	const entry = lastUsage(join(dir, `agent-${to}.jsonl`));

	if (entry === null) {
		return null;
	}

	const usage = fieldsOf(fieldsOf(entry["message"])["usage"]);
	const ttl: CacheTtl =
		count(fieldsOf(usage["cache_creation"])["ephemeral_1h_input_tokens"]) > 0
			? "1h"
			: "5m";
	// NaN for a timestamp that will not parse, which compares false against the
	// lifetime below: an unreadable clock is not evidence of a cold cache.
	const idleMs = Date.now() - Date.parse(String(entry["timestamp"]));

	return {
		type: agentType(dir, to),
		context: inputTokens(usage),
		ttl,
		idleMs,
		cacheExpired: idleMs > lifetimeMs(ttl),
	};
}

const lifetimeMs = (ttl: CacheTtl): number =>
	ttl === "1h" ? 60 * 60_000 : 5 * 60_000;

function lastUsage(file: string): Record<string, unknown> | null {
	const text = ifPresent(() => readFileSync(file, "utf8"));

	if (text === null) {
		return null;
	}

	for (const entry of newestFirst(text.split("\n"))) {
		if (
			entry["type"] === "assistant" &&
			isTable(fieldsOf(entry["message"])["usage"])
		) {
			return entry;
		}
	}

	return null;
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
