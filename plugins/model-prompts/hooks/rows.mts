// The row shape everything downstream works in terms of, and the checking that
// turns the configuration table into rows.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfigFile } from "../lib/config.mts";
import { errorCode, errorMessage, isTable } from "../lib/fields.mts";
import { FAULTS } from "./plugin.mts";

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

/**
 * Every configured row, checked, in the order they will be injected, which is
 * the order they are written in.
 */
export async function loadRows(
	args: readonly string[],
): Promise<readonly Row[]> {
	const file = await loadConfigFile(FAULTS, args);

	return file === null ? [] : rowsIn(file.path, file.table);
}

function rowsIn(path: string, config: Record<string, unknown>): readonly Row[] {
	const models = config["models"];

	if (models === undefined) {
		return [];
	}

	if (!isTable(models)) {
		throw FAULTS.configFault(path, "has [models], which is not a table");
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
		throw FAULTS.configFault(path, detail);
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
		throw FAULTS.configFault(path, detail);
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
			`has ${label} file ${resolved}, which cannot be read (${errorCode(error) ?? errorMessage(error)})`,
		);
	}

	if (text.trim() === "") {
		fault(`has ${label} file ${resolved}, which is empty`);
	}

	return text.trim();
}

function compile(source: string): RegExp | null {
	try {
		return new RegExp(source);
	} catch {
		return null;
	}
}
