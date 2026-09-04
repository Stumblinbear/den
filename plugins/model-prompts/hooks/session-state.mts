// Where a session's disposable state lives. The OS temp directory and never
// the project or the data directory, since every file under it is worthless
// the moment the session ends.
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FaultClass } from "./fault.mts";

export const STATE_DIR = join(tmpdir(), "claude-model-prompts");

/**
 * A session id arrives from the hook input, so it is sanitized rather than
 * trusted as a path component. One place builds every per-session file name,
 * so the record and the fault markers cannot drift apart.
 */
export const stateFile = (
	sessionId: string,
	suffix: FaultClass | "json",
): string =>
	join(STATE_DIR, `${sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}.${suffix}`);
