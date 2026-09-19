// difftastic's JSON read into a page's rows. What it asserts: a captured
// diff of a Rust file reads into hunks, a line difftastic paired with
// nothing marked kept though its layout changed, a line on one side only
// shown on that side, and a changed token marked inside its line; and
// output that is not difftastic's shape gives no body, so the caller keeps
// the line diff. `difft` itself is not run here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { syntaxBody } from "../lib/difftastic.mts";

// A call's arguments rewrapped onto a second line, a statement added and a
// literal changed, then `DFT_UNSTABLE=yes difft --display json old.rs
// new.rs` from difftastic 0.70.0, as it printed it.
const OLD = [
	"fn alpha(a: u32) -> u32 {",
	"    let x = compute(a, 2);",
	"    x + 1",
	"}",
	"",
	"fn beta() {}",
	"",
].join("\n");
const NEW = [
	"fn alpha(a: u32) -> u32 {",
	"    let x = compute(",
	"        a, 2);",
	"    log(x);",
	"    x + 2",
	"}",
	"",
	"fn beta() {}",
	"",
].join("\n");
const JSON_OUT =
	'{"aligned_lines":[[0,0],[1,1],[null,2],[null,3],[2,4],[3,5],[4,6],[5,7],[6,8]],"chunks":[[{"rhs":{"line_number":3,"changes":[{"start":4,"end":7,"content":"log","highlight":"normal"},{"start":7,"end":8,"content":"(","highlight":"delimiter"},{"start":8,"end":9,"content":"x","highlight":"normal"},{"start":9,"end":10,"content":")","highlight":"delimiter"},{"start":10,"end":11,"content":";","highlight":"normal"}]}},{"lhs":{"line_number":2,"changes":[{"start":8,"end":9,"content":"1","highlight":"keyword"}]},"rhs":{"line_number":4,"changes":[{"start":8,"end":9,"content":"2","highlight":"keyword"}]}}]],"language":"Rust","path":"new.rs","status":"changed"}';

const ctx = (text: string) => ({ kind: "ctx", text }) as const;

test("difftastic's JSON reads into hunks of kept, removed and added lines", () => {
	assert.deepEqual(syntaxBody(JSON_OUT, OLD, NEW, 1), {
		kind: "syntax",
		hunks: [
			{
				oldStart: 2,
				newStart: 2,
				context: "",
				lines: [
					{ kind: "ctx", old: 2, new: 2, text: "    let x = compute(" },
					{
						kind: "del",
						old: 3,
						spans: [ctx("    x + "), { kind: "del", text: "1" }],
					},
					{ kind: "add", new: 3, spans: [ctx("        a, 2);")] },
					{
						kind: "add",
						new: 4,
						spans: [ctx("    "), { kind: "add", text: "log(x);" }],
					},
					{
						kind: "add",
						new: 5,
						spans: [ctx("    x + "), { kind: "add", text: "2" }],
					},
					{ kind: "ctx", old: 4, new: 6, text: "}" },
				],
			},
		],
	});
});

test("output that is not difftastic's shape gives no body", () => {
	const past = JSON_OUT.replace("[5,7]", "[9,7]");

	assert.equal(syntaxBody("warning: not JSON", OLD, NEW, 3), null);
	assert.equal(syntaxBody('{"status":"changed"}', OLD, NEW, 3), null);
	assert.equal(syntaxBody(past, OLD, NEW, 3), null);
});
