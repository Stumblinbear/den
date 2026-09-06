// Which runs a fault report is carried on, and how long the session goes on
// hearing about one. A report is a fact about the run that met it and not
// about the session, so it arrives again on every turn the fault stands, and
// the turn the fault goes is the turn the reports stop. Nothing is written
// down between runs: a plugin has nowhere on the screen to keep a standing
// indicator, and nothing here can see whether the user has read anything.
//
// The measurement entry runs on every tool call as well as on the prompt, and
// twenty of the same line inside one turn is a line nobody reads, so it
// reports on the prompt alone. An entry Claude Code calls once at the end of a
// turn, or once for a tool call it guards, reports on every run it makes.
// `config-errors.test.mts` holds what counts as a fault at all, what each
// report says, and the run a fixed config takes effect on.
//
// These run the real processes through the launcher, because the whole
// contract is out of band: what a run writes on stdout for the agent.
import { test } from "node:test";
import { runtimes } from "../../../tests/harness.mts";
import { assistant } from "./fixtures.mts";
import {
	BROKEN,
	configFile,
	hookRunner,
	quiet,
	reported,
	sessionId,
	transcript,
	USABLE,
	unreadableSession,
} from "./harness.mts";

for (const runtime of runtimes()) {
	const hook = hookRunner(runtime);
	const sid = () => sessionId(runtime);
	const name = (what: string) => `${runtime}: ${what}`;
	// Under every threshold, so a run with nothing to report has nothing to
	// inject either and its silence is the whole of its output.
	const quietly = transcript(assistant(50_000));
	const measure = (session: string, event: string, config: string) =>
		hook(
			"context-budget",
			{
				hook_event_name: event,
				session_id: session,
				transcript_path: quietly,
			},
			config,
		);
	const prompt = (session: string, config: string) =>
		measure(session, "UserPromptSubmit", config);
	const toolCall = (session: string, config: string) =>
		measure(session, "PostToolUse", config);
	// The guard's own run coming apart: a directory where the session's
	// transcript belongs is a read that fails on something other than absence.
	const guardCrash = (session: string, config: string) =>
		hook(
			"resume-guard",
			{
				hook_event_name: "PreToolUse",
				tool_name: "SendMessage",
				session_id: session,
				tool_input: { to: "big" },
				transcript_path: unreadableSession("big", [assistant(162_300)]),
			},
			config,
		);

	test(name("a standing config fault is reported on every prompt"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		for (let turn = 1; turn <= 3; turn += 1) {
			reported(prompt(session, path), "config");
		}
	});

	test(name("the tool calls inside a turn carry it no further"), () => {
		const session = sid();
		const path = configFile(BROKEN);

		reported(prompt(session, path), "config");

		for (let call = 1; call <= 5; call += 1) {
			quiet(toolCall(session, path));
		}

		reported(prompt(session, path), "config");
	});

	// The guard is on a tool call rather than on the turn, so it names no
	// prompt event: the run that met the fault is the only run there is to
	// report it, and a run held back would be a fault nobody ever hears.
	test(name("an entry with no prompt event reports on every run"), () => {
		const session = sid();
		const path = configFile(USABLE);

		reported(guardCrash(session, path), "internal");
		reported(guardCrash(session, path), "internal");
	});
}
