// The fixture every test file runs on, this repository's and each plugin's:
// where the shared sources are, throwaway directories for a case to write
// into, the runtimes to run every case under, and the spawn that runs an entry
// the way `hooks.json` does. Everything here is something every plugin's tests
// need; what only the configured plugins need is in `fault-checks.mts`. A
// plugin's own harness builds what is particular to it on top of this one.
// Importing this registers no test of its own.
//
// Node always runs; bun runs when it answers a version probe, since the two
// strip types differently and only running both proves the sources are the
// syntax they both accept.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

export type Runtime = "node" | "bun";

export interface Result {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

/** One run of an entry, as the launcher is given it. */
export interface HookRun {
	readonly launcher: string;
	readonly data: string;
	/**
	 * The child's own temp directory. Node and bun both read `TMPDIR`, `TEMP`
	 * and `TMP` for it, so whatever state the entry keeps lands where the case
	 * can see it, and never in the real temp directory.
	 */
	readonly temp: string;
	/** The entry's path relative to the plugin directory, then its arguments. */
	readonly argv: readonly string[];
	readonly input: unknown;
	/**
	 * Written on stdin in place of `input` as JSON. What a hook is handed is
	 * whatever the process that started it wrote there, which is not always
	 * JSON, and a case about that has to write the text itself.
	 */
	readonly stdin?: string | undefined;
	/**
	 * Anything else the child's environment needs, such as its `HOME`. A key
	 * whose value is `undefined` is left out of the child's environment, which
	 * takes away whatever this process holds under that name.
	 */
	readonly env?: Readonly<Record<string, string | undefined>>;
}

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

export const LIB = join(ROOT, "lib");

const FIXTURES = mkdtempSync(join(tmpdir(), "den-test-"));

process.on("exit", () => {
	rmSync(FIXTURES, { recursive: true, force: true });
});

let seq = 0;

/** A fresh directory to write a case's own files into. */
export function fixtureDir(prefix: string): string {
	seq += 1;

	const dir = join(FIXTURES, `${prefix}-${seq}`);

	mkdirSync(dir, { recursive: true });

	return dir;
}

/**
 * A lock directory standing at `path`, made and signed the way
 * `file-lock.mts` makes and signs one: the token a run knows its own lock by,
 * and the pid every other run judges that run by. A null pid leaves it
 * unsigned, which is a lock made a moment ago and not yet written into.
 */
export function standingLock(path: string, pid: number | null): void {
	mkdirSync(path, { recursive: true });

	if (pid !== null) {
		writeFileSync(
			join(path, "holder"),
			JSON.stringify({ token: randomUUID(), pid }),
		);
	}
}

/**
 * Called by each test file rather than read off an import, since a machine
 * without bun is told so in the file's own report: a green run there must not
 * read as bun having passed.
 */
export function runtimes(): readonly Runtime[] {
	if (spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0) {
		return ["node", "bun"];
	}

	test("the bun leg is skipped: bun did not answer a version probe", {
		skip: true,
	}, () => {
		// Nothing to run; the skipped name is the whole point.
	});

	return ["node"];
}

/** A plugin data directory whose `.runtime` pins one leg's interpreter. */
export function dataDir(runtime: Runtime): string {
	const dir = fixtureDir(`data-${runtime}`);

	writeFileSync(join(dir, ".runtime"), `${runtime}\n`);

	return dir;
}

/**
 * The temp directory a run is given, one per session id, so the record a run
 * leaves behind is reachable by the case that caused it and by no other.
 */
export function childTemp(
	plugin: string,
	input: Record<string, unknown>,
): string {
	const session = String(input["session_id"] ?? "no-session");
	const dir = join(FIXTURES, `${plugin}-temp-${session}`);

	mkdirSync(dir, { recursive: true });

	return dir;
}

/**
 * A per-test session id, which is also what the temp directory a run is given
 * is named after. Ids differ per runtime leg too, so the two legs cannot see
 * each other's state.
 */
export function sessionId(plugin: string, runtime: Runtime): string {
	seq += 1;

	return `${plugin}-test-${process.pid}-${runtime}-${seq}`;
}

/** Runs an entry the way `hooks.json` does: plain `node`, then the launcher. */
export function runHook(run: HookRun): Result {
	const result = spawnSync(
		process.execPath,
		[run.launcher, "--data", run.data, ...run.argv],
		{
			input: run.stdin ?? JSON.stringify(run.input),
			encoding: "utf8",
			env: childEnv(run),
		},
	);

	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

/** A run still going, for a case with something to do while it runs. */
export interface Started {
	/** What the run wrote, once it has ended. */
	ended(): Promise<Result>;
	/**
	 * Ends the run and the entry under it, for a case that has seen what it
	 * came for. `ended()` resolves with whatever was written up to then, and no
	 * status. A run that had already ended keeps the status it ended with.
	 */
	kill(): void;
}

/**
 * The same run as `runHook`, left going, for an entry that outlives the hook
 * call. Claude Code runs an entry registered `"async": true` this way, and
 * waits for nothing.
 *
 * The launcher gives the entry its own stdio, so the pipes here are the
 * entry's, and what it wrote is read back whole once it has ended.
 */
export function startHook(run: HookRun): Started {
	const child = spawn(
		process.execPath,
		[run.launcher, "--data", run.data, ...run.argv],
		{
			env: childEnv(run),
			// A process group of its own, which is what `killTree` signals to
			// reach the entry under the launcher. The run leaves the terminal's
			// foreground group with it, so a local Ctrl+C reaches neither one and
			// leaves an orphan to end on its own. Windows has no groups, and
			// `detached` there opens a console window for the run.
			detached: process.platform !== "win32",
		},
	);
	let stdout = "";
	let stderr = "";
	let killed = false;

	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});
	child.stdin.end(run.stdin ?? JSON.stringify(run.input));

	const ended = new Promise<Result>((resolve) => {
		// `close` rather than `exit`: by then the pipes above have been drained.
		child.on("close", (status) => {
			// A killed run reports no status at all: what the launcher exits
			// with is the platform's, null for the signal on POSIX and 1 from
			// `taskkill` on Windows.
			resolve({ status: killed ? null : status, stdout, stderr });
		});
		child.on("error", (error) =>
			resolve({ status: null, stdout, stderr: String(error) }),
		);
	});

	const kill = (): void => {
		if (killTree(child)) {
			killed = true;
		}
	};

	return { ended: () => ended, kill };
}

/**
 * Ends the launcher and every process under it, and says whether there was one
 * still running to end.
 */
function killTree(child: ChildProcess): boolean {
	// Both codes are set at `exit`, which comes before the `close` a run ends
	// on, so a launcher that exited on its own while the pipes were still
	// draining is caught here and keeps the status it exited with.
	if (
		child.pid === undefined ||
		child.exitCode !== null ||
		child.signalCode !== null
	) {
		return false;
	}

	if (process.platform === "win32") {
		spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
			stdio: "ignore",
		});

		return true;
	}

	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		// The group ended between the check above and this signal, and `close`
		// is on its way with the status the run ended with.
		return false;
	}

	return true;
}

/** The child's environment: this process's, with the run's keys over it. */
const childEnv = (run: HookRun): Record<string, string | undefined> => ({
	// biome-ignore lint/style/noProcessEnv: the child needs PATH to find its interpreter, and everything below is what this run overrides.
	...process.env,
	...run.env,
	TMPDIR: run.temp,
	TEMP: run.temp,
	TMP: run.temp,
});
