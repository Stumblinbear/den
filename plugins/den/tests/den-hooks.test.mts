// den's two relays, exercised through the launcher, which is the exact command
// `hooks.json` runs. What they assert is the structure of the relay: which
// completions leave a flag, that one prompt turns every pending flag into one
// injection naming the agents it was for, and that the files it read are gone.
// The reminder's wording is not a contract; a session reads it, no test does.
//
// Each case is given a temp directory of its own, which is where the relays
// keep their flags, so nothing a case leaves behind reaches the next one.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	dataDir,
	fixtureDir,
	type Result,
	runHook,
	runtimes,
} from "../../../tests/harness.mts";

const PLUGIN = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const LAUNCHER = join(PLUGIN, "lib", "shared", "launch.mjs");

interface HookEntry {
	readonly matcher?: string;
	readonly hooks: readonly { readonly command: string }[];
}

/**
 * The SubagentStop matcher `hooks.json` gives the entry that runs `hook`.
 * Which agent types reach a flag hook is decided there, since Claude Code
 * applies a SubagentStop matcher to the agent type; the hook itself flags
 * whatever reaches it. A matcher with a `|` is a regex and is not anchored
 * by Claude Code, so each is anchored here, or `fork` would match any type
 * containing the word.
 */
function matcherFor(hook: string): string {
	const config = JSON.parse(
		readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8"),
	) as { hooks: { SubagentStop: HookEntry[] } };
	const entry = config.hooks.SubagentStop.find((candidate) =>
		candidate.hooks.some((h) => h.command.includes(`hooks/${hook}`)),
	);
	assert.ok(entry, `no SubagentStop entry runs ${hook}`);
	return entry.matcher ?? "";
}

// Spelled out rather than imported from the relays, so a relay that starts
// writing its flags somewhere else fails a test instead of taking the tests
// with it.
const REVIEW = "claude-review-triage";
const IMPLEMENTER = "claude-implementer-triage";

interface Injection {
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		readonly additionalContext?: string;
	};
}

// `transcript_path` is fixed: neither relay reads it, and a SubagentStop
// without it is not the shape a hook is handed.
// Every input carries a session id, since the flags are kept per session.
const SESSION = "session-1";

const stop = (
	agentType: string,
	agentId: string,
	session = SESSION,
): Record<string, unknown> => ({
	hook_event_name: "SubagentStop",
	session_id: session,
	agent_type: agentType,
	agent_id: agentId,
	transcript_path: "",
});

const prompt = (session = SESSION) => ({
	hook_event_name: "UserPromptSubmit",
	session_id: session,
	prompt: "carry on",
});

/** The flags waiting in one relay's directory, empty until the first one. */
function pending(
	temp: string,
	relay: string,
	session = SESSION,
): readonly string[] {
	try {
		return readdirSync(join(temp, relay, session)).sort();
	} catch {
		return [];
	}
}

function injected(result: Result): string {
	assert.equal(result.status, 0, result.stderr);

	const output = JSON.parse(result.stdout) as Injection;

	assert.equal(output.hookSpecificOutput?.hookEventName, "UserPromptSubmit");

	const context = output.hookSpecificOutput?.additionalContext;

	assert.equal(typeof context, "string", result.stdout);

	return String(context);
}

for (const runtime of runtimes()) {
	const data = dataDir(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (entry: string, temp: string, input: unknown) =>
		runHook({
			launcher: LAUNCHER,
			data,
			temp,
			argv: [`hooks/${entry}`],
			input,
		});

	test(name("a review agent's completion leaves a review flag"), () => {
		const temp = fixtureDir("review-flags");
		const matched = run(
			"review-triage-flag",
			temp,
			stop("den:reviewer", "reviewer-1"),
		);

		assert.equal(matched.status, 0, matched.stderr);
		assert.equal(matched.stdout, "");
		assert.deepEqual(pending(temp, REVIEW), ["reviewer-1.json"]);

		run("review-triage-flag", temp, stop("den:closure-verifier", "closure-1"));
		assert.deepEqual(pending(temp, REVIEW), [
			"closure-1.json",
			"reviewer-1.json",
		]);

		// The matcher, not the hook, keeps every other agent out.
		assert.equal(
			matcherFor("review-triage-flag"),
			"^(den:reviewer|den:closure-verifier)$",
		);

		// A stop with no type reached the hook unscoped, since no matcher can
		// match an empty type; a reminder for it would name nobody.
		const typeless = run("review-triage-flag", temp, stop("", "typeless-1"));

		assert.equal(typeless.status, 0, typeless.stderr);
		assert.deepEqual(pending(temp, REVIEW), [
			"closure-1.json",
			"reviewer-1.json",
		]);
	});

	test(name("a flag is announced only in the session that raised it"), () => {
		const temp = fixtureDir("review-sessions");

		run("review-triage-flag", temp, stop("den:reviewer", "reviewer-1"));
		run(
			"review-triage-flag",
			temp,
			stop("den:reviewer", "reviewer-2", "session-2"),
		);

		const other = run("review-triage-inject", temp, prompt("session-2"));

		assert.ok(injected(other).includes("den:reviewer"), other.stdout);
		assert.deepEqual(pending(temp, REVIEW), ["reviewer-1.json"]);
		assert.deepEqual(pending(temp, REVIEW, "session-2"), []);

		// Without a session id there is nothing to announce and nothing to keep.
		const nowhere = run(
			"review-triage-flag",
			temp,
			stop("den:reviewer", "reviewer-3", ""),
		);
		assert.equal(nowhere.status, 0, nowhere.stderr);
		// The relay directory holds the two sessions' subdirectories and no file.
		assert.deepEqual(pending(temp, REVIEW, ""), ["session-1", "session-2"]);

		const silent = run("review-triage-inject", temp, prompt(""));
		assert.equal(silent.status, 0, silent.stderr);
		assert.equal(silent.stdout, "");
		assert.deepEqual(pending(temp, REVIEW), ["reviewer-1.json"]);
	});

	// A session id is a directory component. `..` would resolve a relay to the
	// temp directory itself, whose every JSON file the drain would then delete
	// and announce as a finished agent.
	test(
		name("a dot-segment session id reaches nothing outside the relay"),
		() => {
			const temp = fixtureDir("review-traversal");
			writeFileSync(join(temp, "victim.json"), "{}");

			const result = run("review-triage-inject", temp, prompt(".."));

			assert.equal(result.status, 0, result.stderr);
			assert.equal(result.stdout, "");
			assert.ok(readdirSync(temp).includes("victim.json"));
		},
	);

	test(name("one prompt injects for every pending review flag, once"), () => {
		const temp = fixtureDir("review-inject");

		run("review-triage-flag", temp, stop("den:reviewer", "reviewer-1"));
		run("review-triage-flag", temp, stop("den:closure-verifier", "closure-2"));

		const context = injected(run("review-triage-inject", temp, prompt()));

		assert.ok(context.includes("den:reviewer"), context);
		assert.ok(context.includes("den:closure-verifier"), context);
		assert.deepEqual(pending(temp, REVIEW), []);

		// The flags are consumed, so the next prompt has nothing to say.
		const again = run("review-triage-inject", temp, prompt());

		assert.equal(again.status, 0, again.stderr);
		assert.equal(again.stdout, "");
	});

	test(name("every finished implementer leaves a flag"), () => {
		const temp = fixtureDir("implementer-flags");
		const matched = run(
			"implementer-triage-flag",
			temp,
			stop("den:implementer-opus", "opus-1"),
		);

		assert.equal(matched.status, 0, matched.stderr);
		assert.equal(matched.stdout, "");
		assert.deepEqual(pending(temp, IMPLEMENTER), ["opus-1.json"]);

		// A fork of the session arrives under Claude Code's built-in type,
		// bare, and implements too.
		const fork = run("implementer-triage-flag", temp, stop("fork", "fork-1"));

		assert.equal(fork.status, 0, fork.stderr);
		assert.deepEqual(pending(temp, IMPLEMENTER), [
			"fork-1.json",
			"opus-1.json",
		]);

		// The matcher, not the hook, keeps a reviewer's completion out.
		assert.equal(
			matcherFor("implementer-triage-flag"),
			"^(den:implementer-opus|den:implementer-haiku|den:implementer-fable|fork)$",
		);
	});

	test(
		name("one prompt injects for every pending implementer flag, once"),
		() => {
			const temp = fixtureDir("implementer-inject");

			run(
				"implementer-triage-flag",
				temp,
				stop("den:implementer-opus", "opus-1"),
			);
			run(
				"implementer-triage-flag",
				temp,
				stop("den:implementer-fable", "fable-1"),
			);

			const context = injected(
				run("implementer-triage-inject", temp, prompt()),
			);

			assert.ok(context.includes("den:implementer-opus"), context);
			assert.ok(context.includes("den:implementer-fable"), context);
			assert.deepEqual(pending(temp, IMPLEMENTER), []);

			// The flags are consumed, so the next prompt has nothing to say.
			const again = run("implementer-triage-inject", temp, prompt());

			assert.equal(again.status, 0, again.stderr);
			assert.equal(again.stdout, "");
		},
	);
}
