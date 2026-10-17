// Stamped temp files: `stampedTempFile` names a new file under the OS temp
// directory.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Names a new file `name`, stamped with the moment, with `extension`, in the
 * temp directory `dirName`:
 * `<temp>/<dirName>/<name>-2026-10-17-09-30-00.<ext>`.
 *
 * @remarks
 * The stamp is UTC to the second, so two calls in one second name the same
 * file. The call creates `dirName` where it is missing and leaves the file for
 * the caller to write. It is for a file the user or an agent reads once:
 * under the OS temp directory beside the other den plugins' per-session
 * files, it outlives nothing it should not and needs no cleanup of its own.
 */
export function stampedTempFile(
	dirName: string,
	name: string,
	extension: string,
): string {
	const stamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.replace("T", "-")
		.slice(0, 19);
	const dir = join(tmpdir(), dirName);

	mkdirSync(dir, { recursive: true });

	return join(dir, `${name}-${stamp}.${extension}`);
}
