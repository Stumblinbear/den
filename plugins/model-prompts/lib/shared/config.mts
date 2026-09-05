// The one file an entry reads: finding it on the command line, reading it,
// parsing it, and the faults each of those three can raise. What the table
// then has to contain is the plugin's own business.
import { readFileSync } from "node:fs";
import type { Faults } from "./fault.mts";
import { errorCode, errorMessage, firstLine } from "./fields.mts";

export interface ConfigFile {
	/** Named in every report about it, and what paths inside it resolve from. */
	readonly path: string;
	readonly table: Record<string, unknown>;
}

/**
 * The parsed configuration, or null when the file is not there. A missing file
 * is the unconfigured state rather than a fault: the plugin is installed and
 * has nothing to say yet.
 */
export async function loadConfigFile(
	faults: Faults,
	args: readonly string[],
): Promise<ConfigFile | null> {
	const path = configPath(faults, args);
	const text = configText(faults, path);

	if (text === null) {
		return null;
	}

	return { path, table: parsed(faults, await tomlParser(faults), path, text) };
}

function configPath(faults: Faults, args: readonly string[]): string {
	const at = args.indexOf("--config");
	const path = at < 0 ? undefined : args[at + 1];

	if (path === undefined) {
		// Only a hand-written command line gets here; `hooks.json` always passes
		// the flag.
		throw faults.fault(
			"config",
			"the run had no --config path",
			"add --config <config file> to the command",
		);
	}

	return path;
}

// Imported only once there is something to parse, so a user who has written no
// configuration is never told about a dependency they are not using.
async function tomlParser(
	faults: Faults,
): Promise<(text: string) => Record<string, unknown>> {
	try {
		const { parse } = await import("smol-toml");

		return parse;
	} catch (error) {
		throw faults.fault(
			"parser",
			"the smol-toml package could not be imported",
			"reinstall the plugin, or run `npm ci` in its cache directory",
			error,
		);
	}
}

function configText(faults: Faults, path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return null;
		}

		throw faults.configFault(
			path,
			`cannot be read (${errorCode(error) ?? errorMessage(error)})`,
			error,
		);
	}
}

function parsed(
	faults: Faults,
	parse: (text: string) => Record<string, unknown>,
	path: string,
	text: string,
): Record<string, unknown> {
	try {
		return parse(text);
	} catch (error) {
		throw faults.configFault(
			path,
			`is not valid TOML: ${firstLine(errorMessage(error)) || "unparseable"}`,
			error,
		);
	}
}
