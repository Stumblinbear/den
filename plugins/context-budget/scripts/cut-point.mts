// The `context-budget:cut-point` skill's preamble command: a current reading
// of which rewind cut points are still free in the session it runs in.
//
// This is the only place a cut point is named: a prompt named in the message
// the measurement hook injects is named before the agent is ready to act on
// it, and may be out of the cache by the time it is. The messages say how
// large the session is and send the agent here.
//
// All it adds to the reading itself is finding the transcript to read and the
// rate to price it at, both of which the skill's preamble hands it on the
// command line: `--pricing` and `--pricing-overrides` for the price table, and
// `--session`, which Claude Code substitutes into that preamble, for the
// transcript.
//
// Prints to stdout and always exits 0: its output is read as prose by the
// agent, so an explanation of why there is no list is more use than a stack
// trace.
import process from "node:process";
import { argValue } from "../lib/args.mts";
import { cacheReading } from "../lib/cache-reading.mts";
import { loadPricing } from "../lib/pricing.mts";
import { scanCacheWindow } from "../lib/prompt-cache.mts";
import { recordedTranscript } from "../lib/session-record.mts";
import { errorCode, errorMessage } from "../lib/shared/fields.mts";

const NO_RECORD =
	"No measurement recorded for this session: the context-budget hook is not running here, or this run was passed no `--session`. Pass `--transcript <path to the session's .jsonl>` to read one directly.";

/**
 * The transcript this run is to read. The measurement hook writes the path on
 * every run, so any session this plugin is loaded in has a record from its
 * first tool call onwards, and a session with none is one the hook has never
 * measured.
 *
 * A recorded path is handed on whether or not anything is there to read: a
 * transcript moved or deleted since the measurement is a different fault from
 * a session that was never measured, and `reading()` reports it as one, by
 * name and by code.
 */
function transcriptFor(named: string | null, session: string): string | null {
	if (named !== null) {
		return named;
	}

	return session === "" ? null : recordedTranscript(session);
}

async function reading(
	path: string,
	shipped: string | null,
	overrides: string | null,
): Promise<string> {
	// The model priced against comes out of the transcript being read, not out
	// of the record: `--transcript` is how one session reads another's, and the
	// record belongs to the reader.
	const pricing = await loadPricing({ shipped, overrides });

	try {
		return cacheReading(scanCacheWindow(path), pricing);
	} catch (error) {
		return `The transcript at ${path} could not be read (${errorCode(error) ?? errorMessage(error)}), so the cache window is unknown.`;
	}
}

const args = process.argv.slice(2);
const path = transcriptFor(
	argValue(args, "--transcript"),
	argValue(args, "--session") ?? "",
);

process.stdout.write(
	path === null
		? `${NO_RECORD}\n`
		: `${await reading(path, argValue(args, "--pricing"), argValue(args, "--pricing-overrides"))}\n`,
);
