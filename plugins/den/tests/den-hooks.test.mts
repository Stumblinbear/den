// den's two relays, exercised through the launcher, which is the exact command
// `hooks.json` runs. What they assert is the structure of the relay: which
// completions leave a flag, that one prompt turns every pending flag into one
// injection naming the agents it was for, and that the files it read are gone.
// The reminder's wording is not a contract; a session reads it, no test does.
//
// Each case is given a temp directory of its own, which is where the relays
// keep their flags, so nothing a case leaves behind reaches the next one.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
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
const stop = (agentType: string, agentId: string): Record<string, unknown> => ({
	hook_event_name: "SubagentStop",
	agent_type: agentType,
	agent_id: agentId,
	transcript_path: "",
});

const prompt = () => ({
	hook_event_name: "UserPromptSubmit",
	prompt: "carry on",
});

/** The flags waiting in one relay's directory, empty until the first one. */
function pending(temp: string, relay: string): readonly string[] {
	try {
		return readdirSync(join(temp, relay)).sort();
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

	// The SubagentStop matcher does not reliably scope the hook, so the type it
	// was matched on is filtered again in the hook itself.
	test(name("only a review agent's completion leaves a review flag"), () => {
		const temp = fixtureDir("review-flags");
		const matched = run(
			"review-triage-flag",
			temp,
			stop("den:review-synthesizer", "reviewer-1"),
		);

		assert.equal(matched.status, 0, matched.stderr);
		assert.equal(matched.stdout, "");
		assert.deepEqual(pending(temp, REVIEW), ["reviewer-1.json"]);

		run("review-triage-flag", temp, stop("den:closure-verifier", "closure-1"));
		assert.deepEqual(pending(temp, REVIEW), [
			"closure-1.json",
			"reviewer-1.json",
		]);

		const other = run(
			"review-triage-flag",
			temp,
			stop("den:surveyor", "surveyor-1"),
		);

		assert.equal(other.status, 0, other.stderr);
		assert.deepEqual(pending(temp, REVIEW), [
			"closure-1.json",
			"reviewer-1.json",
		]);
	});

	test(name("one prompt injects for every pending review flag, once"), () => {
		const temp = fixtureDir("review-inject");

		run(
			"review-triage-flag",
			temp,
			stop("den:review-synthesizer", "reviewer-1"),
		);
		run(
			"review-triage-flag",
			temp,
			stop("plugin_den_review-synthesizer", "reviewer-2"),
		);

		const context = injected(run("review-triage-inject", temp, prompt()));

		assert.ok(context.includes("den:review-synthesizer"), context);
		assert.ok(context.includes("plugin_den_review-synthesizer"), context);
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

		// A reviewer's completion belongs to the other relay, and this hook
		// fires for it too.
		const reviewer = run(
			"implementer-triage-flag",
			temp,
			stop("den:review-synthesizer", "reviewer-1"),
		);

		assert.equal(reviewer.status, 0, reviewer.stderr);
		assert.deepEqual(pending(temp, IMPLEMENTER), ["opus-1.json"]);
	});

	test(
		name("one prompt injects for every pending implementer flag, once"),
		() => {
			const temp = fixtureDir("implementer-inject");

			run(
				"implementer-triage-flag",
				temp,
				stop("den:red-green-fixer", "fixer-1"),
			);
			run(
				"implementer-triage-flag",
				temp,
				stop("plugin_den_implementer-fable", "fable-1"),
			);

			const context = injected(
				run("implementer-triage-inject", temp, prompt()),
			);

			assert.ok(context.includes("den:red-green-fixer"), context);
			assert.ok(context.includes("plugin_den_implementer-fable"), context);
			assert.deepEqual(pending(temp, IMPLEMENTER), []);

			// The flags are consumed, so the next prompt has nothing to say.
			const again = run("implementer-triage-inject", temp, prompt());

			assert.equal(again.status, 0, again.stderr);
			assert.equal(again.stdout, "");
		},
	);
}
