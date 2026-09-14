// PreToolUse reminder on an edit to text an agent follows. A skill, an agent
// definition, a rules file and a hook's injected text are a product of their
// own, and the rules for writing them load at session start, many turns before
// the edit: the edit carries the reminder instead.
//
// The path is the whole of the test: text an agent follows is kept under a
// `skills`, `agents`, `hooks` or `references` directory, or in a `SKILL.md`
// or `CLAUDE.md`, wherever in a tree those sit and whether or not a plugin is
// what the tree holds. A prompt string inside a source file is text an agent
// follows too, and no path tells it from the code around it, so that one is
// left to the repository's own rules.
import process from "node:process";
import { fieldsOf } from "../lib/shared/fields.mts";
import { hookInput } from "../lib/shared/hook-input.mts";

const AGENT_TEXT =
	/(^|\/)(agents|hooks|references|skills)\/|(^|\/)(CLAUDE|SKILL)\.md$/;

const REMINDER = "Text an agent follows: audit under `den:writing-for-agents`.";

try {
	const input = await hookInput();

	// Both Edit and Write name the file they are about to change; anything else
	// reaching this hook names none, and is nothing this reminder is for.
	const path = String(
		fieldsOf(fieldsOf(input)["tool_input"])["file_path"] ?? "",
	).replaceAll("\\", "/");

	if (AGENT_TEXT.test(path)) {
		process.stdout.write(
			JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					additionalContext: REMINDER,
				},
			}),
		);
	}
} catch {
	// A run that cannot read its input says nothing. The edit proceeds either
	// way, and a hook error in the reminder's place is noise for the reader.
}
