// What stops a hook run, and the once-per-session report that stands in place
// of any recovery. There are no stand-in values: a hook that cannot do its job
// says so, once, and then leaves the session alone.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { STATE_DIR, stateFile } from "./session-state.mts";

export type FaultClass = "parser" | "config";

export interface FaultOptions extends ErrorOptions {
	/** Which report marker silences this fault for the rest of the session. */
	readonly cls: FaultClass;
}

export class HookFault extends Error {
	readonly cls: FaultClass;

	constructor(text: string, options: FaultOptions) {
		super(text, options);
		this.cls = options.cls;
	}
}

/**
 * One report per class per session, then silence: false says this session has
 * already been told. The marker outlives the process, so the SessionStart run
 * and every model switch after it count as one session.
 */
export function reportOnce(sessionId: string, fault: HookFault): boolean {
	const marker = stateFile(sessionId, fault.cls);

	if (existsSync(marker)) {
		return false;
	}

	try {
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(marker, new Date().toISOString());
	} catch {
		// A temp directory that cannot be written costs the silence, not the
		// report: saying it every time beats never saying it.
	}

	process.stderr.write(`${fault.message}\n`);

	return true;
}
