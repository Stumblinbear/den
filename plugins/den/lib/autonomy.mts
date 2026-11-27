// A session's autonomy: whether it is on, starting and stopping it, and the
// prompt that carries its rules into the session's context.
//
// - `startAutonomy` and `stopAutonomy` turn it on and off, and
//   `SwitchRemoveError` is a stop that turned it off but left the switch.
// - `autonomyState` reads it back.
// - `autonomyPrompt` is the rules.
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { errorCode } from "./shared/fields.mts";
import { sessionFilePath } from "./shared/session-state.mts";

/** Where a session's autonomy stands; null for one that never used it. */
export type AutonomyState = "on" | "off" | null;

/** The project's autonomy log, relative to the project directory. */
const AUTONOMY_LOG = join(".local", "autonomy-log.md");

/**
 * The path of the rules file. The rules reach the session only through den's
 * hooks, never through a skill's text.
 *
 * @remarks
 * Claude Code re-attaches an invoked skill's text after a compaction, so rules
 * carried there would come back after autonomy ended and read as live.
 */
const PROMPT = fileURLToPath(
	new URL("../hooks/autonomy-prompt.md", import.meta.url),
);

/**
 * A session ID as Claude Code writes one. The paths here are safe for any
 * string. This refuses a string that is not a session ID, such as an empty or
 * unexpanded `${CLAUDE_SESSION_ID}`, so nothing is written for it at all.
 */
const SESSION_ID = /^[A-Za-z0-9-]+$/;

/** The session's autonomy state file. */
const stateFile = (session: string): string =>
	sessionFilePath("claude-den", session, "autonomy");

/**
 * The path of context-budget's unattended switch for `session`.
 *
 * @remarks
 * The directory `claude-context-budget` and the suffix `unattended` must match
 * the path context-budget's README documents for the switch.
 */
const switchFile = (session: string): string =>
	sessionFilePath("claude-context-budget", session, "unattended");

/** @throws when `session` is not a session ID */
function checkSessionId(session: string): void {
	if (!SESSION_ID.test(session)) {
		throw new Error(`'${session}' is not a session ID`);
	}
}

function writeFile(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

/**
 * Turns autonomy on for `session`.
 *
 * @remarks
 * Writes context-budget's unattended switch, and removes the autonomy log an
 * earlier run left in `project` so this run's log starts empty. A start that
 * throws leaves the autonomy state and the switch as they were.
 *
 * @throws when `session` is not a session ID, or a file could not be written
 * or removed
 */
export function startAutonomy(session: string, project: string): void {
	checkSessionId(session);

	const path = switchFile(session);
	const switchExisted = existsSync(path);

	try {
		writeFile(path, "");
		rmSync(join(project, AUTONOMY_LOG), { force: true });
		writeFile(stateFile(session), "on");
	} catch (error) {
		if (!switchExisted) {
			rmSync(path, { force: true });
		}

		throw error;
	}
}

/**
 * A stop that recorded autonomy as off but could not remove context-budget's
 * unattended switch at `path`.
 */
export class SwitchRemoveError extends Error {
	readonly path: string;

	constructor(path: string, options: { cause: unknown }) {
		super(`could not remove '${path}'`, options);
		this.path = path;
	}
}

/**
 * Turns autonomy off for `session` and removes context-budget's unattended
 * switch.
 *
 * @remarks
 * A session that never used autonomy is recorded as off too.
 *
 * @throws {@link SwitchRemoveError} when the switch could not be removed,
 * after the session was recorded as off
 * @throws when `session` is not a session ID or the state could not be
 * written, with the state left as it was
 */
export function stopAutonomy(session: string): void {
	checkSessionId(session);
	writeFile(stateFile(session), "off");

	const path = switchFile(session);

	try {
		rmSync(path, { force: true });
	} catch (error) {
		throw new SwitchRemoveError(path, { cause: error });
	}
}

/**
 * The autonomy state recorded for `session`. A state file with any text but
 * `on` reads as off.
 *
 * @throws when the file exists and cannot be read
 */
export function autonomyState(session: string): AutonomyState {
	if (!SESSION_ID.test(session)) {
		return null;
	}

	let text: string;

	try {
		text = readFileSync(stateFile(session), "utf8");
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return null;
		}

		throw error;
	}

	return text === "on" ? "on" : "off";
}

/**
 * The rules autonomy runs under, as den ships them.
 *
 * @throws when the file cannot be read
 */
export const autonomyPrompt = (): string => readFileSync(PROMPT, "utf8");
