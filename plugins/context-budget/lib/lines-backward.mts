// Reading a file's lines from the last to the first, in chunks off the end.
// Its own subject because the reader that wants them stops as soon as it has
// its answer: what that saves is the whole of the file above the point it
// stopped at, which in a session left running is most of it.
import { Buffer } from "node:buffer";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

/**
 * Big enough that a normal transcript's whole cached stretch is one or two
 * reads, small enough that a session idle past its cache lifetime, where the
 * newest prompt is already cold and the scan stops at it, pays for almost
 * nothing.
 */
export const CHUNK_BYTES = 128 * 1024;

const NEWLINE = 0x0a;

/**
 * The file's lines, newest first. Chunks are joined as bytes and split on
 * newlines before decoding, so a multi-byte character straddling a chunk
 * boundary is never cut in half.
 *
 * Raises whatever opening the file raised: a caller handed a path that is not
 * a file has that to say about it.
 */
export function* linesBackward(path: string): Generator<string> {
	const fd = openSync(path, "r");

	try {
		let pos = fstatSync(fd).size;
		let pending = Buffer.alloc(0);

		while (pos > 0) {
			const length = Math.min(CHUNK_BYTES, pos);
			const chunk = Buffer.alloc(length);

			readSync(fd, chunk, 0, length, pos - length);
			pos -= length;

			const buffer =
				pending.length > 0 ? Buffer.concat([chunk, pending]) : chunk;
			// Everything above the earliest newline in this chunk is the start
			// of a line whose remainder is in the chunk before it.
			const start = yield* linesIn(buffer);

			pending = buffer.subarray(0, start);
		}

		if (pending.length > 0) {
			yield pending.toString("utf8");
		}
	} finally {
		closeSync(fd);
	}
}

/**
 * Every whole line in the buffer, last first, and where the earliest of them
 * began: the bytes above that are the tail of a line the chunk before this one
 * holds the rest of, and the whole buffer where it holds no newline at all.
 */
function* linesIn(buffer: Buffer): Generator<string, number> {
	let end = buffer.length;

	for (let i = buffer.length - 1; i >= 0; i--) {
		if (buffer[i] !== NEWLINE) {
			continue;
		}

		if (end > i + 1) {
			yield buffer.toString("utf8", i + 1, end);
		}

		end = i;
	}

	return end;
}
