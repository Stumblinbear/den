// Where a plugin's disposable state lives. The OS temp directory and never the
// project or the data directory, since every file under it is worthless the
// moment the session that wrote it ends.
import { tmpdir } from "node:os";
import { join } from "node:path";

/** One plugin's temp directory, and the names of the files it keeps there. */
export interface SessionState {
	/** Created before the first write; nothing ever cleans it out. */
	readonly dir: string;
	/**
	 * A key arrives from a run's input -- a session id -- so it is sanitized
	 * rather than trusted as a path component. One place builds every name, so
	 * files meant to sit beside each other cannot drift apart.
	 */
	file(key: string, suffix: string): string;
}

export function sessionState(directory: string): SessionState {
	const dir = join(tmpdir(), directory);

	return {
		dir,
		file: (key, suffix) =>
			join(dir, `${key.replace(/[^A-Za-z0-9._-]/g, "_")}.${suffix}`),
	};
}
