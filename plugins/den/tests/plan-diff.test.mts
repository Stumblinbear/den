// Tests for the plan page's diff parser, on the patches where a `--- ` line
// may or may not open a file's headers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diffRows } from "../lib/plan/diff.mts";

const patch = (...lines: string[]) => lines.map((line) => `${line}\n`).join("");

test("inside a hunk, a removed `-- ` line and an added `++ ` line are changes, not file headers", () => {
	const parsed = diffRows(
		patch(
			"diff --git a/q.sql b/q.sql",
			"--- a/q.sql",
			"+++ b/q.sql",
			"@@ -1,2 +1,2 @@",
			"--- old comment",
			"+++ new comment",
			" select 1;",
		),
	);

	assert.deepEqual(parsed, {
		rows: [
			{ kind: "file", text: "q.sql" },
			{ kind: "hunk", text: "⋯ " },
			{
				kind: "removed",
				text: "--- old comment",
				oldLine: 1,
				newLine: undefined,
			},
			{
				kind: "added",
				text: "+++ new comment",
				oldLine: undefined,
				newLine: 1,
			},
			{ kind: "context", text: " select 1;", oldLine: 2, newLine: 2 },
		],
		files: ["q.sql"],
		numbered: true,
	});
});

test("a plain `diff -u` patch of two files, with no `diff --git` lines, names both and shows neither's headers as content", () => {
	const parsed = diffRows(
		patch(
			"--- a/one.txt",
			"+++ b/one.txt",
			"@@ -1 +1 @@",
			"-a",
			"+b",
			"--- a/two.txt",
			"+++ b/two.txt",
			"@@ -3,0 +4 @@",
			"+c",
		),
	);

	assert.deepEqual(parsed, {
		rows: [
			{ kind: "file", text: "one.txt" },
			{ kind: "hunk", text: "⋯ " },
			{ kind: "removed", text: "-a", oldLine: 1, newLine: undefined },
			{ kind: "added", text: "+b", oldLine: undefined, newLine: 1 },
			{ kind: "file", text: "two.txt" },
			{ kind: "hunk", text: "⋯ " },
			{ kind: "added", text: "+c", oldLine: undefined, newLine: 4 },
		],
		files: ["one.txt", "two.txt"],
		numbered: true,
	});
});
