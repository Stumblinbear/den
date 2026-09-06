// PreToolUse guard on SendMessage. A resumed subagent re-reads its whole
// transcript on every turn it takes, at the cached rate while its prompt cache
// is warm, plus one full-price replay first when the cache has expired. Past
// some size a fresh launch that rebuilds only what it needs is cheaper than
// resuming, so the guard denies the resume with the numbers in the reason,
// leaving Claude to put the choice to the user before it retries.
import process from "node:process";
import { consume, resumeApproval } from "../lib/approval.mts";
import { fill, formatTokens } from "../lib/messages.mts";
import { FAULTS, insideJudge } from "../lib/plugin.mts";
import { type GuardLimits, loadSettings } from "../lib/settings.mts";
import { runEntry } from "../lib/shared/entry.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import {
	type Done,
	LEFT_AFTER_CONFIG,
	LEFT_BEFORE_CONFIG,
} from "../lib/shared/run.mts";
import { type Resumed, resumedAgent } from "../lib/subagent.mts";

const args = process.argv.slice(2);

/** The deny to write, or null for a resume this guard has nothing against. */
async function decision(
	sessionId: string,
	input: Record<string, unknown>,
): Promise<Done> {
	// Read before anything else, so `enabled = false` costs no transcript read.
	const settings = await loadSettings(args);
	const limits = settings?.guard.limits ?? null;

	if (settings === null || limits === null) {
		return LEFT_AFTER_CONFIG;
	}

	const to = agentName(input["tool_input"]);
	const transcript = String(input["transcript_path"] ?? "");

	if (to === null || transcript === "") {
		return LEFT_AFTER_CONFIG;
	}

	const resumed = resumedAgent(transcript, to);

	if (resumed === null) {
		return null;
	}

	const why = reasons(limits, resumed);

	if (why.length === 0) {
		return null;
	}

	const approval = resumeApproval(transcript);

	if (approval !== null && consume(sessionId, approval)) {
		return null;
	}

	return deny(
		fill(approval === null ? settings.guard.denied : settings.guard.used, {
			agent: to,
			type: resumed.type,
			tokens: formatTokens(resumed.context),
			reasons: why.join("; "),
			large: formatTokens(limits.large),
			cold: formatTokens(limits.cold),
		}),
	);
}

/**
 * Which limits this resume is past, and why each one matters. Empty for a
 * resume that is past none, which is every resume the guard allows.
 */
function reasons(limits: GuardLimits, resumed: Resumed): readonly string[] {
	const size = `${formatTokens(resumed.context)} tokens`;
	const why: string[] = [];

	if (resumed.context > limits.large) {
		why.push(
			`context ${size} is above the ${formatTokens(limits.large)} resume limit: every turn re-reads it`,
		);
	}

	if (resumed.cacheExpired && resumed.context > limits.cold) {
		why.push(
			`last active ${Math.round(resumed.idleMs / 60_000)} min ago, ${resumed.ttl} cache expired: cold full-price replay of ${size}`,
		);
	}

	return why;
}

/**
 * The subagent the message is addressed to. Claude Code spells the target
 * `name [agent type]`; anything left that is not a bare name is not a
 * subagent of this session, and there is no transcript to read for it.
 */
function agentName(toolInput: unknown): string | null {
	const to = String(fieldsOf(toolInput)["to"] ?? "")
		.replace(/\s*\[[^\]]*\]\s*$/, "")
		.trim();

	return /^[A-Za-z0-9._-]+$/.test(to) ? to : null;
}

function deny(reason: string): string {
	return JSON.stringify({
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason: reason,
		},
	});
}

// The run itself, last in the file and below every binding it reads: a `const`
// read from here before its own declaration throws a ReferenceError, which the
// runner would report as the bug it is.
await runEntry(
	{ name: "resume-guard", faults: FAULTS },
	async ({ input, session }) => {
		// Without a session id there is no record to spend an answer in: every
		// input carrying none would share one file named for no session at all.
		if (
			input["tool_name"] !== "SendMessage" ||
			session === "" ||
			insideJudge()
		) {
			return LEFT_BEFORE_CONFIG;
		}

		return decision(session, input);
	},
);
