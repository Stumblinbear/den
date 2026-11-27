// The unattended switch: a file another plugin puts beside the session record,
// at `<os temp dir>/claude-context-budget/<session id>.unattended`, while the
// session runs with nobody watching it. Only its presence counts.
import { existsSync } from "node:fs";
import { STATE_DIRECTORY } from "./plugin.mts";
import { sessionFilePath } from "./shared/session-state.mts";

/** Whether the session's switch file exists. */
export const isUnattended = (sessionId: string): boolean =>
	existsSync(sessionFilePath(STATE_DIRECTORY, sessionId, "unattended"));
