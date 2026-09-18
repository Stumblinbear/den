// Which agent a message reaches, and so whose transcript the guard measures.
// Claude Code takes an agent's name in `to` as readily as its id: a forked
// skill is messaged as `den-flag-review`, while its transcript stays at
// `agent-<id>.jsonl` with the name in the metadata file beside it. A skill
// forked twice leaves two agents under one name, and the message reaches the
// one the session started last. Measuring the other is the failure nobody
// notices, since the deny it writes is well-formed and the number in it is
// real.
//
// What makes a resume worth refusing at all is `resume-guard.test.mts`.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { agentLaunch, taskNotification } from "./background-fixtures.mts";
import { assistant, at } from "./fixtures.mts";
import { decided, guardRunner, PROMPT, reason } from "./guard-runs.mts";
import { configFile, sessionId, subagentSession, USABLE } from "./harness.mts";

const CONFIG = configFile(USABLE);

const NAME = "den-flag-review";
const FIRST = "a0000000000000000";
const LAST = "a1234567890abcdef";

/** Where Claude Code keeps the subagents of the session at `path`. */
const subagents = (path: string): string =>
	join(path.replace(/\.jsonl$/, ""), "subagents");

/** Writes each of `ids` a metadata file carrying the one name. */
function named(path: string, ...ids: readonly string[]): void {
	for (const id of ids) {
		writeFileSync(
			join(subagents(path), `agent-${id}.meta.json`),
			JSON.stringify({ agentType: "den:flag-reviewer", name: NAME }),
		);
	}
}

for (const runtime of runtimes()) {
	const guard = guardRunner(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	const run = (path: string) => guard(sessionId(runtime), path, NAME, CONFIG);

	// The ordinary case: one forked skill, messaged by its name. Nothing in the
	// session transcript is needed to find it, the metadata file alone names it.
	test(name("a name one agent carries finds that agent"), () => {
		const path = subagentSession(LAST, [assistant(260_900)], [PROMPT]);

		named(path, LAST);

		assert.match(
			reason(run(path)),
			/^DENIED den-flag-review: context 260\.9K tokens is above the 150K resume limit/,
		);
	});

	// The last fork's 260.9K is over the limit where the first fork's 10K
	// passes, so the deny says which one was measured. The second run pins the
	// running check to the same id, since a launch record carries the id and
	// never the name.
	test(name("a message addressed by the agent's name is guarded"), () => {
		const session = (entries: readonly string[]) => {
			const path = subagentSession(
				LAST,
				[assistant(260_900, { minutesAgo: 30 })],
				entries,
			);

			writeFileSync(
				join(subagents(path), `agent-${FIRST}.jsonl`),
				`${assistant(10_000, { minutesAgo: 60 })}\n`,
			);
			named(path, FIRST, LAST);

			return path;
		};
		const launched = [
			PROMPT,
			agentLaunch(FIRST, at(60)),
			taskNotification(FIRST, at(45)),
			agentLaunch(LAST, at(30)),
		];

		assert.match(
			reason(run(session([...launched, taskNotification(LAST, at(9))]))),
			/context 260\.9K tokens is above the 150K resume limit/,
		);
		assert.equal(
			decided(run(session(launched))),
			null,
			"still running, under the id its launch carries",
		);
	});

	// The big agent here is the first fork, long stopped, and the message
	// reaches the fresh one, which has never spoken and so has nothing to
	// measure. An agent launched a moment ago has its metadata file and no turn
	// of its own, so the session's launch records are the order. Pricing the
	// stopped fork would deny a resume nobody asked for and spend the user's
	// answer on it.
	test(name("a name reaches the agent the session launched last"), () => {
		const path = subagentSession(
			FIRST,
			[assistant(260_900, { minutesAgo: 30 })],
			[
				PROMPT,
				agentLaunch(FIRST, at(60)),
				taskNotification(FIRST, at(45)),
				agentLaunch(LAST, at(1)),
			],
		);

		named(path, FIRST, LAST);

		assert.equal(
			decided(run(path)),
			null,
			"the message reaches the agent launched last, which has never spoken",
		);
	});
}
