// Tests for the markdown wrapper plan-step wraps the step's prose with.
import assert from "node:assert/strict";
import { test } from "node:test";
import { wrapMarkdown } from "../lib/markdown-wrap.mts";

test("prose breaks at spaces within the width, and a word longer than it stands alone", () => {
	assert.deepEqual(wrapMarkdown("one two three four five six", 10), [
		"one two",
		"three four",
		"five six",
	]);
	assert.deepEqual(wrapMarkdown("x averyveryverylongword y", 10), [
		"x",
		"averyveryverylongword",
		"y",
	]);
});

test("a wrapped list item and quote keep their marker's indent", () => {
	assert.deepEqual(wrapMarkdown("- alpha beta gamma delta", 12), [
		"- alpha beta",
		"  gamma",
		"  delta",
	]);
	assert.deepEqual(wrapMarkdown("> alpha beta gamma", 10), [
		"> alpha",
		"> beta",
		"> gamma",
	]);
});

test("fenced code, a table row and a heading stay whole, and prose after a fence wraps again", () => {
	const kept = [
		"````",
		"a code line far longer than the width",
		"```",
		"still code, since three ticks cannot close four",
		"````",
		"| a table cell | far longer than the width |",
		"# A heading far longer than the width",
	];

	assert.deepEqual(wrapMarkdown([...kept, "after the fence"].join("\n"), 10), [
		...kept,
		"after the",
		"fence",
	]);
});
