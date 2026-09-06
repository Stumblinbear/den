// A judge a case can see, and the seam it is reached through: the `command`
// key, which is what a user whose judge is another runtime writes. Nothing
// here is a stub inside the hook, so what the cases exercise is the whole path
// from the gate through the spawn and back into the record.
//
// Its own module because the judge is a program of its own, written out below
// and run by this same Node. Importing this registers no test of its own.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { dataDir, fixtureDir, type Runtime } from "../../../tests/harness.mts";
import { ANSWER_SCHEMA } from "../lib/answer.mts";
import { LAUNCHER } from "./harness.mts";

/**
 * A judge reached the way Windows reaches a CLI an npm install put on PATH:
 * by a bare word that resolves to a `.cmd`, which is the spawn the plugin
 * retries through its command interpreter.
 */
export interface Shim {
	/** `command` as the file writes it, naming the shim by that bare word. */
	readonly command: readonly string[];
	/** What the run's environment needs for the word to resolve to it. */
	readonly env: Readonly<Record<string, string>>;
}

/**
 * PATH as this platform spells it, since Windows stores it as `Path` and a
 * second spelling beside it is a second variable, not a replacement.
 */
const PATH_KEY: string =
	// biome-ignore lint/style/noProcessEnv: what the child inherits is what this process holds, and prefixing a directory onto it means reading it first.
	Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ??
	"PATH";

/**
 * The judge as a case drives it. It writes down every prompt it is handed and
 * answers whatever the case last told it to, so a case asks it how many times
 * it was consulted rather than inferring that from what the record holds
 * afterwards.
 */
export interface Judge {
	/** The `[watcher]` section pointing the watcher at this judge. */
	readonly config: string;
	/** The same section, with `extra` words written after the command. */
	configWith(...extra: readonly string[]): string;
	/** The prompts it has been handed, oldest first. */
	prompts(): readonly string[];
	/** What it was last started with, and none for a judge never run. */
	argv(): readonly string[];
	/** The directory it was last started in, and empty for a judge never run. */
	cwd(): string;
	/** What it answers from here on. */
	answers(answer: unknown): void;
	/**
	 * An entry run from inside the call, before it answers, which is how a case
	 * reaches the moment a judge is in flight. The nested run is handed the
	 * session's own temp directory, and the judge marker is taken out of its
	 * environment, since a real Stop arriving mid-call is not inside a judge.
	 */
	nests(entry: string, input: Record<string, unknown>, config: string): void;
	/**
	 * A `.cmd` beside the judge that runs it, the command naming that file by a
	 * bare word, and the environment the word resolves under. Windows only:
	 * elsewhere nothing looks for a `.cmd`, and the command runs as any other.
	 */
	shim(): Shim;
	/**
	 * A transcript rewritten from inside the call, before it answers, which is
	 * how a case reaches a compaction that landed under a judge still running.
	 * `lines` are the transcript's whole new contents, as `transcript` takes
	 * them.
	 */
	rewrites(path: string, lines: readonly string[]): void;
}

export function judge(runtime: Runtime): Judge {
	const dir = fixtureDir("judge");
	const file = (name: string) => join(dir, name);
	const script = file("judge.mjs");
	const log = file("prompts.jsonl");
	const where = file("cwd.txt");
	const answer = file("answer.json");
	const nested = file("nested.json");
	const rewritten = file("rewritten.json");
	const started = file("argv.json");

	writeFileSync(script, JUDGE);
	writeFileSync(answer, "{}");

	const argv = [
		process.execPath,
		script,
		"--log",
		log,
		"--cwd",
		where,
		"--answer",
		answer,
		"--nested",
		nested,
		"--rewrites",
		rewritten,
		"--argv",
		started,
		// Where the default command carries it, and the same schema. It is the
		// one argument a command line can destroy, so every case that consults
		// this judge sends it and one of them reads it back.
		"--json-schema",
		ANSWER_SCHEMA,
	];

	const section = (extra: readonly string[]) =>
		`[watcher]\ncommand = ${JSON.stringify([...argv, ...extra])}\n`;

	return {
		config: section([]),
		configWith: (...extra) => section(extra),
		shim: () => {
			// `%*` hands on the arguments as the interpreter parsed them, which
			// is what a schema of braces and quotes has to survive.
			writeFileSync(
				file("judge.cmd"),
				`@echo off\r\n"${process.execPath}" "${script}" %*\r\n`,
			);

			return {
				command: ["judge", ...argv.slice(2)],
				env: {
					// biome-ignore lint/style/noProcessEnv: the shim is found by PATH, so the run needs the one this process has with the fixture directory in front of it.
					[PATH_KEY]: `${dir};${process.env[PATH_KEY] ?? ""}`,
				},
			};
		},
		prompts: () => lines(log).map((line) => String(JSON.parse(line))),
		argv: () => {
			const written = lines(started)[0];

			return written === undefined
				? []
				: (JSON.parse(written) as readonly string[]);
		},
		cwd: () => lines(where)[0] ?? "",
		answers: (written) => {
			writeFileSync(answer, JSON.stringify(written));
		},
		nests: (entry, input, config) => {
			writeFileSync(
				nested,
				JSON.stringify({
					argv: [
						LAUNCHER,
						"--data",
						dataDir(runtime),
						`hooks/${entry}`,
						"--config",
						config,
					],
					input,
				}),
			);
		},
		rewrites: (path, lines) => {
			writeFileSync(rewritten, JSON.stringify({ path, lines }));
		},
	};
}

function lines(path: string): readonly string[] {
	try {
		return readFileSync(path, "utf8").split("\n").filter(Boolean);
	} catch {
		// Nothing has consulted it yet.
		return [];
	}
}

/**
 * The judge itself, written where a case can point `command` at it. Plain
 * JavaScript run by this same Node, so the case is about the seam rather than
 * about anything the plugin's own interpreter choice does.
 */
const JUDGE = `import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const argv = process.argv.slice(2);
const value = (flag) => argv[argv.indexOf(flag) + 1];
const read = (path) => {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
};

let prompt = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	prompt += chunk;
});
process.stdin.on("end", () => {
	appendFileSync(value("--log"), JSON.stringify(prompt) + "\\n");
	writeFileSync(value("--cwd"), process.cwd());
	writeFileSync(value("--argv"), JSON.stringify(argv));

	const rewrites = read(value("--rewrites"));

	if (rewrites !== null) {
		// Once only, for the same reason the nested run is once only.
		rmSync(value("--rewrites"), { force: true });

		const moved = JSON.parse(rewrites);

		writeFileSync(moved.path, moved.lines.join("\\n") + "\\n");
	}

	const nested = read(value("--nested"));

	if (nested !== null) {
		// Once only: a gate that let the nested run through would otherwise
		// nest again, and again.
		rmSync(value("--nested"), { force: true });

		const run = JSON.parse(nested);
		const env = { ...process.env };

		delete env.CONTEXT_BUDGET_JUDGE;
		spawnSync(process.execPath, run.argv, {
			input: JSON.stringify(run.input),
			encoding: "utf8",
			env,
		});
	}

	process.stdout.write(read(value("--answer")) ?? "{}");
});
`;
