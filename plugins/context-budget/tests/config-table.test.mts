// The duration reader: which strings come out as which number of
// milliseconds, and which are refused with a fault naming the key. Called in
// process, since what these are about is the number it returns and the text
// of the fault it raises.
import assert from "node:assert/strict";
import { test } from "node:test";
import { durationOr, type Section } from "../lib/config-table.mts";

const section = (table: Record<string, unknown>): Section => ({
	path: "config.toml",
	label: "[wake.'1h']",
	table,
});

const NAMES_THE_KEY = /\[wake\.'1h'\] before that is not a duration above zero/;

test("a duration is read into milliseconds, and an absent one is the default", () => {
	const cases: readonly [string, number][] = [
		["45s", 45_000],
		["3m", 180_000],
		["1h", 3_600_000],
		["1h30m", 5_400_000],
		["1m30s", 90_000],
		["2h5m10s", 7_510_000],
		[" 3m ", 180_000],
	];

	for (const [written, ms] of cases) {
		assert.equal(durationOr(section({ before: written }), "before", 1), ms);
	}

	assert.equal(durationOr(section({}), "before", 12_345), 12_345);
});

test("a duration that is not one is a fault naming the key", () => {
	const refused: readonly unknown[] = [
		"",
		"0s",
		"0h0m",
		"90",
		"-3m",
		"3 m",
		"3M",
		"1.5m",
		"1s1h",
		180_000,
		true,
	];

	for (const written of refused) {
		assert.throws(
			() => durationOr(section({ before: written }), "before", 1),
			NAMES_THE_KEY,
			`${JSON.stringify(written)} was read as a duration`,
		);
	}
});
