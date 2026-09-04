// The TOML configuration the hook reads, and the row shape everything
// downstream works in terms of.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { HookFault } from "./fault.mts";

const OFF = "No prompts are injected while this stands";

export type OnSwitch = "every" | "once" | "never";

/**
 * A row that injects. Its text is already resolved: `file` is relative to the
 * config file, and that is only known while reading it. So is its key: every
 * run tests every row, and none of them recompiles the expression.
 */
export interface Row {
	readonly key: string;
	readonly match: RegExp;
	readonly text: string;
	readonly onStart: boolean;
	readonly onSwitch: OnSwitch;
}

export function configPath(args: readonly string[]): string | null {
	const at = args.indexOf("--config");

	return at < 0 ? null : (args[at + 1] ?? null);
}

/**
 * Every configured row, checked, in the order they will be injected, which is
 * the order they are written in. No file is the unconfigured state rather than
 * a fault: the plugin is installed and has nothing to say yet.
 */
export async function loadConfig(path: string | null): Promise<readonly Row[]> {
	if (path === null) {
		// Only a hand-written command line gets here; `hooks.json` always passes
		// the flag.
		throw new HookFault(
			`model-prompts: config error -- the hook ran with no --config path. ${OFF}; add --config <config file> to the command.`,
			{ cls: "config" },
		);
	}

	const text = configText(path);

	if (text === null) {
		return [];
	}

	return rowsIn(path, table(await tomlParser(), path, text));
}

// Imported only once there is something to parse, so a user who has written no
// configuration is never told about a dependency they are not using.
async function tomlParser(): Promise<
	(text: string) => Record<string, unknown>
> {
	try {
		const { parse } = await import("smol-toml");

		return parse;
	} catch (error) {
		throw new HookFault(
			`model-prompts: parser error -- the smol-toml package could not be imported. ${OFF}; reinstall the plugin, or run \`npm ci\` in its cache directory.`,
			{ cls: "parser", cause: error },
		);
	}
}

function configText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		if (code(error) === "ENOENT") {
			return null;
		}

		throw configFault(
			path,
			`cannot be read (${code(error) ?? errorMessage(error)})`,
			error,
		);
	}
}

function table(
	parse: (text: string) => Record<string, unknown>,
	path: string,
	text: string,
): Record<string, unknown> {
	try {
		return parse(text);
	} catch (error) {
		throw configFault(
			path,
			`is not valid TOML: ${firstLine(errorMessage(error))}`,
			error,
		);
	}
}

function rowsIn(path: string, config: Record<string, unknown>): readonly Row[] {
	const models = config["models"];

	if (models === undefined) {
		return [];
	}

	if (!isTable(models)) {
		throw configFault(path, "has [models], which is not a table");
	}

	const rows: Row[] = [];

	for (const [key, value] of Object.entries(models)) {
		const row = rowFrom(path, key, value);

		if (row !== null) {
			rows.push(row);
		}
	}

	return rows;
}

/** The checked row, or null for one switched off, which needs no text. */
function rowFrom(path: string, key: string, value: unknown): Row | null {
	const label = `[models.'${key}']`;
	const fault: (detail: string) => never = (detail) => {
		throw configFault(path, detail);
	};

	if (!isTable(value)) {
		fault(`has ${label}, which is not a table`);
	}

	const match = compile(key);

	if (match === null) {
		fault(`has ${label}, whose key is not a regular expression`);
	}

	const enabled = value["enabled"] ?? true;

	if (typeof enabled !== "boolean") {
		fault(`has ${label} enabled that is not a boolean`);
	}

	const onStart = value["on_start"] ?? true;

	if (typeof onStart !== "boolean") {
		fault(`has ${label} on_start that is not a boolean`);
	}

	const onSwitch = value["on_switch"] ?? "once";

	if (onSwitch !== "every" && onSwitch !== "once" && onSwitch !== "never") {
		fault(`has ${label} on_switch that is not "every", "once", or "never"`);
	}

	// Everything a row says is checked; only its text is excused, since a row
	// parked for later has nothing to inject.
	if (!enabled) {
		return null;
	}

	return { key, match, text: textFor(path, label, value), onStart, onSwitch };
}

// `prompt` and `file` are two spellings of the same value, so a row that gives
// both leaves no way to tell which its author meant, and a row that gives
// neither has nothing to inject.
function textFor(
	path: string,
	label: string,
	row: Record<string, unknown>,
): string {
	const fault: (detail: string) => never = (detail) => {
		throw configFault(path, detail);
	};

	const prompt = row["prompt"];
	const file = row["file"];

	if (prompt !== undefined && file !== undefined) {
		fault(
			`has ${label} with both prompt and file; a row carries one or the other`,
		);
	}

	if (file === undefined) {
		if (prompt === undefined) {
			fault(`has ${label} with neither prompt nor file`);
		}

		if (typeof prompt !== "string" || prompt.trim() === "") {
			fault(`has ${label} prompt that is not a non-empty string`);
		}

		return prompt.trim();
	}

	if (typeof file !== "string" || file.trim() === "") {
		fault(`has ${label} file that is not a non-empty string`);
	}

	const resolved = resolve(dirname(path), file);

	let text: string;

	try {
		text = readFileSync(resolved, "utf8");
	} catch (error) {
		fault(
			`has ${label} file ${resolved}, which cannot be read (${code(error) ?? errorMessage(error)})`,
		);
	}

	if (text.trim() === "") {
		fault(`has ${label} file ${resolved}, which is empty`);
	}

	return text.trim();
}

const isTable = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function compile(source: string): RegExp | null {
	try {
		return new RegExp(source);
	} catch {
		return null;
	}
}

const configFault = (path: string, detail: string, cause?: unknown) =>
	new HookFault(
		`model-prompts: config error -- ${path} ${detail}. ${OFF}; fix or delete that file.`,
		{ cls: "config", cause },
	);

const code = (error: unknown): string | undefined =>
	isTable(error) && typeof error["code"] === "string"
		? error["code"]
		: undefined;

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const firstLine = (text: string) =>
	(text.split("\n")[0] ?? "unparseable").trim();
