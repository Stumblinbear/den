// What the `[wake]` section reads as: the defaults an absent table takes, a
// row switched off, the example against those defaults, and the values a file
// writes. Called in process, since the subject is the settings a file produces
// and not what a hook does with them. Which key a refused file's report has to
// name is `config-errors.test.mts`, through the rows in `invalid-configs.mts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "smol-toml";
import { DEFAULT_WAKE_MESSAGE, loadSettings } from "../lib/settings.mts";
import { fieldsOf } from "../lib/shared/fields.mts";
import { configFile, HOOKS, USABLE } from "./harness.mts";

const EXAMPLE = join(HOOKS, "config.example.toml");

async function wakeOf(...sections: readonly string[]) {
	const settings = await loadSettings(["--config", configFile(...sections)]);

	assert.ok(settings, "a usable file loads");

	return settings.wake;
}

test("a file with no [wake] gets the wake with every key defaulted", async () => {
	const wake = await wakeOf(USABLE);

	assert.equal(wake.enabled, true);
	assert.deepEqual(wake.rows, {
		"1h": { times: 2, before: 180_000 },
		"5m": { times: 5, before: 45_000 },
	});
	assert.equal(wake.message, DEFAULT_WAKE_MESSAGE);
});

// The example documents itself as writing out the defaults, so it has to set
// every key: one it left out would read as the default, and the comparison
// below would pass over the drift.
test("the example's [wake] section writes out the code's defaults", async () => {
	const written = fieldsOf(parse(readFileSync(EXAMPLE, "utf8")))["wake"];
	const sets = (table: unknown, key: string, named: string) =>
		assert.notEqual(
			fieldsOf(table)[key],
			undefined,
			`the example has to set ${named}`,
		);

	sets(written, "enabled", "[wake] enabled");
	for (const ttl of ["1h", "5m"]) {
		sets(fieldsOf(written)[ttl], "times", `[wake.'${ttl}'] times`);
		sets(fieldsOf(written)[ttl], "before", `[wake.'${ttl}'] before`);
	}
	sets(fieldsOf(written)["messages"], "wake", "[wake.messages] wake");

	const example = await loadSettings(["--config", EXAMPLE]);

	assert.ok(example, "the example loads");

	const defaults = await wakeOf(USABLE);

	assert.deepEqual(example.wake.rows, defaults.rows);
	assert.equal(example.wake.enabled, defaults.enabled);
	assert.equal(example.wake.message, DEFAULT_WAKE_MESSAGE);
});

test("a row switched off reads as null and the other keeps its default", async () => {
	const wake = await wakeOf(USABLE, "[wake.'5m']\nenabled = false\n");

	assert.equal(wake.rows["5m"], null);
	assert.deepEqual(wake.rows["1h"], { times: 2, before: 180_000 });
});

test("the values a file writes are read as written", async () => {
	const wake = await wakeOf(
		USABLE,
		"[wake]\nenabled = false\n",
		"[wake.'1h']\ntimes = 1\nbefore = \"90s\"\n",
		"[wake.'5m']\ntimes = 3\nbefore = \"1m\"\n",
		'[wake.messages]\nwake = "WAKE {n} of {times}, {pending} pending"\n',
	);

	assert.equal(wake.enabled, false);
	assert.deepEqual(wake.rows, {
		"1h": { times: 1, before: 90_000 },
		"5m": { times: 3, before: 60_000 },
	});
	assert.equal(wake.message, "WAKE {n} of {times}, {pending} pending");
});
