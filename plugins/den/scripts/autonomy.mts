// Turns autonomy off for one session, for the autonomy-stop skill's preamble.
// A hook starts autonomy instead, since the rules arrive with it. See the
// comment on `PROMPT` in `lib/autonomy.mts` for why.
//
//   autonomy stop <session id>
//
// A stop that succeeds prints nothing, so the skill's text is all the session
// reads. One that fails prints a line saying what changed and why. The exit is
// 0 either way, so a preamble shows the line rather than an error the session
// cannot read.
import process from "node:process";
import { SwitchRemoveError, stopAutonomy } from "../lib/autonomy.mts";
import { errorMessage } from "../lib/shared/fields.mts";

const [command, session] = process.argv.slice(2);

if (command === "stop") {
	try {
		stopAutonomy(session ?? "");
	} catch (error) {
		process.stdout.write(
			error instanceof SwitchRemoveError
				? `Autonomy is off, but context-budget's unattended switch at '${error.path}' could not be removed, so its notices stay off: ${errorMessage(error.cause)}.\n`
				: `Autonomy not changed: ${errorMessage(error)}.\n`,
		);
	}
} else {
	process.stdout.write(
		"Autonomy not changed: the arguments are `stop <session id>`.\n",
	);
}
