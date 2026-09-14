// The price table the cut-point reading is figured at: the rates the plugin
// ships, and the file a user writes beside them to correct one that has moved.
//
// What a cached token costs is a fact about the model, published by whoever
// runs it, so it is not configuration and none of the configuration's rules
// reach it. Getting the user file wrong must cost the session nothing but the
// accuracy of one number: it is dropped whole, the shipped rates stand, and
// nothing is said about it.
//
// What a rate does to a payback is `payback.test.mts`, and which rate a
// transcript is priced at is `reading.test.mts`.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixtureDir } from "../../../tests/harness.mts";
import { loadPricing, readMultiplier } from "../lib/pricing.mts";
import { PLUGIN } from "./harness.mts";

const SHIPPED = join(PLUGIN, "lib", "pricing.toml");

let seq = 0;

/** A user file beside the shipped one, as `~/.claude/plugins/data` holds. */
function override(toml: string): string {
	seq += 1;

	const path = join(fixtureDir("pricing"), `override-${seq}.toml`);

	writeFileSync(path, toml);

	return path;
}

/** The merged table, from the shipped rates and an optional user file. */
const table = (overrides: string | null = null) =>
	loadPricing({ shipped: SHIPPED, overrides });

test("the shipped table prices every tier but Fable at the same rate", async () => {
	const pricing = await table();

	assert.equal(readMultiplier(pricing, "claude-opus-5"), 0.1);
	assert.equal(readMultiplier(pricing, "claude-haiku-4-5-20251001"), 0.1);
	assert.equal(
		readMultiplier(pricing, "claude-fable-5-1"),
		0.025,
		"the one tier with a row of its own",
	);
});

test("a user file replaces the default the rest of the models take", async () => {
	const pricing = await table(override("default = 0.05\n"));

	assert.equal(readMultiplier(pricing, "claude-opus-5"), 0.05);
	assert.equal(
		readMultiplier(pricing, "claude-fable-5-1"),
		0.025,
		"a file correcting the default says nothing about a row",
	);
});

test("a row with a key the shipped table lacks is tried after every shipped row", async () => {
	// `'claude-'` matches every id there is, Fable's included, so where it is
	// tried decides both answers. Behind the shipped rows it prices Opus and
	// leaves Fable on the row written for it; in front of them it would quietly
	// take that exception away.
	const pricing = await table(override("[models]\n'claude-' = 0.5\n"));

	assert.equal(
		readMultiplier(pricing, "claude-opus-5"),
		0.5,
		"no shipped row matches Opus, so the added one does",
	);
	assert.equal(
		readMultiplier(pricing, "claude-fable-5-1"),
		0.025,
		"the shipped `fable` row is tried first and still wins",
	);
});

test("a row whose key matches a shipped one replaces it where it stands", async () => {
	const pricing = await table(override("[models]\n'fable' = 0.4\n"));

	assert.equal(readMultiplier(pricing, "claude-fable-5-1"), 0.4);
	assert.equal(readMultiplier(pricing, "claude-opus-5"), 0.1);
});

test("a price the API cannot charge drops the whole user file", async () => {
	// 5 would price a cached token at five fresh ones, and a cut would read as
	// paying for itself in a turn or two. Half a price list is not a price list
	// anybody wrote, so the file goes and the shipped rates stand.
	for (const bad of ["default = 5\n", "default = 0\n", "default = -1\n"]) {
		assert.equal(
			readMultiplier(await table(override(bad)), "claude-opus-5"),
			0.1,
			bad,
		);
	}
});

test("a user row that will not compile drops the whole file too", async () => {
	const pricing = await table(override("[models]\n'(' = 0.5\n"));

	assert.equal(readMultiplier(pricing, "claude-opus-5"), 0.1);
});

test("a user file that is not there costs the reading nothing", async () => {
	const missing = join(fixtureDir("no-pricing"), "never-written.toml");

	assert.equal(readMultiplier(await table(missing), "claude-opus-5"), 0.1);
});

test("an empty model id takes the default, never a row that matches anything", async () => {
	// An empty id is not a model a row can be written for: it is a transcript
	// saying nothing about what it was sent to. A row keyed to match anything
	// would otherwise take it as a match and price the reading at a rate the
	// opening line then calls the default.
	const pricing = await table(override("[models]\n'.*' = 0.5\n"));

	assert.equal(
		readMultiplier(pricing, ""),
		0.1,
		"the catch-all row is there and an empty id still does not match it",
	);
	assert.equal(
		readMultiplier(pricing, "claude-opus-5"),
		0.5,
		"a real id does, which is what makes the empty one a refusal, not a miss",
	);
});

test("there is no table where there is no shipped file to read", async () => {
	assert.equal(await loadPricing({ shipped: null, overrides: null }), null);
	assert.equal(
		await loadPricing({
			shipped: join(fixtureDir("no-pricing"), "absent.toml"),
			overrides: null,
		}),
		null,
		"and none where the shipped file cannot be read",
	);
	assert.equal(
		readMultiplier(null, "claude-opus-5"),
		null,
		"which is what makes a reading fall back to the default rate",
	);
});
