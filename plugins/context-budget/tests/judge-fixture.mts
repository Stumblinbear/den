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
import { LAUNCHER } from "./harness.mts";

/**
 * The judge as a case drives it. It writes down every prompt it is handed and
 * answers whatever the case last told it to, so a case asks it how many times
 * it was consulted rather than inferring that from what the record holds
 * afterwards.
 */
export interface Judge {
	/** The `[watcher]` section pointing the watcher at this judge. */
	readonly config: string;
	/** The prompts it has been handed, oldest first. */
	prompts(): readonly string[];
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
	];

	return {
		config: `[watcher]\ncommand = ${JSON.stringify(argv)}\n`,
		prompts: () => lines(log).map((line) => String(JSON.parse(line))),
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
