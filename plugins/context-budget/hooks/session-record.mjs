// The one file a session leaves behind: its record, holding the latest reading
// the measurement hook took and the faults either hook has already reported.
// Written by both hooks and read by the cut-point script, which is handed a
// session id and nothing else and finds the transcript through it.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Per-session state for both hooks. The OS temp directory and never the
// project or the data directory, since all of it is worthless the moment the
// session ends.
export const STATE_DIR = join(tmpdir(), "claude-context-budget");

// A session id is a uuid in practice, but it arrives from outside and ends up
// as a path, so anything that is not a plain name is flattened here rather
// than at each caller.
export const stateFile = (sessionId) =>
  join(STATE_DIR, String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_") + ".json");

// The record as it stands, or an empty one: a session that has not been
// measured yet, a file half-written by a run that died, and a file that was
// never there all mean the same thing to every reader of it.
export function readRecord(sessionId) {
  try {
    const record = JSON.parse(readFileSync(stateFile(sessionId), "utf8"));

    return record && typeof record === "object" ? record : {};
  } catch {
    return {};
  }
}

// `fields` merged over the record and written whole. The reading and the
// reported faults are written by different callers at different moments -- the
// measurement hook every run, either hook the first time it meets a fault --
// and neither has any business dropping the other's.
export function writeRecord(sessionId, fields) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(
    stateFile(sessionId),
    JSON.stringify({ ...readRecord(sessionId), ...fields }),
  );
}
