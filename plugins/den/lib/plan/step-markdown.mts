// Step markdown: `renderStepMarkdown` writes a plan's frame and some of its
// steps as one markdown file for an agent to work from.
import { extname } from "node:path";
import { FENCE, wrapMarkdown } from "../markdown-wrap.mts";
import { fieldsOf, isTable } from "../shared/fields.mts";
import type { LoadedPlan } from "./load.mts";
import { openQuestionsIn, proposalsIn, userDecisionsIn } from "./parts.mts";
import { codeSource } from "./sources.mts";
import { STEP_STATUS_WORDS } from "./step-status.mts";

/**
 * The column prose is wrapped at, so an agent's file reader pages through the
 * file a line at a time and never truncates one.
 */
const WIDTH = 100;

/** The words the file gives each status a proposal can have. */
const PROPOSAL_STATUS_WORDS: Readonly<Record<string, string>> = {
	notRaised: "not raised",
	noObjection: "no objection",
	leftToAgent: "left to the implementer",
	approved: "approved",
	objected: "objected",
};

type JsonObject = Record<string, unknown>;

const text = (value: unknown): string | undefined =>
	typeof value === "string" && value !== "" ? value : undefined;

const elements = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];

/** Wraps `markdown` into lines; none where it is no text or empty. */
function prose(markdown: unknown): string[] {
	const value = text(markdown);

	return value === undefined ? [] : wrapMarkdown(value, WIDTH);
}

/**
 * Writes `markdown` after `prefix`, wrapped at {@link WIDTH}, as a list item
 * or a labelled line: `- choice`, `  Why: reason`, `F7: claim`.
 *
 * @remarks
 * Each later line keeps the prefix's indent, two spaces deeper under a list
 * marker, so it renders as part of the same item. Markdown that opens on a
 * code fence starts on the line below the prefix, so the fence begins its own
 * line and its code stays whole.
 */
function hanging(prefix: string, markdown: string): string[] {
	const [, spaces = "", marker] = prefix.match(/^(\s*)(- )?/) ?? [];
	const indent = marker === undefined ? spaces : `${spaces}  `;
	const [first = "", ...rest] = markdown.replace(/\r\n?/g, "\n").split("\n");
	const indented = (line: string): string =>
		line === "" ? "" : `${indent}${line}`;
	const lines = FENCE.test(first)
		? [prefix.trimEnd(), indented(first), ...rest.map(indented)]
		: [`${prefix}${first}`, ...rest.map(indented)];

	return wrapMarkdown(lines.join("\n"), WIDTH);
}

/**
 * Puts `heading` over `body`, a blank line after each; nothing where `body` is
 * empty.
 */
function section(heading: string, body: string[]): string[] {
	return body.length === 0 ? [] : [heading, "", ...body, ""];
}

/** Writes each of `items` as a list item; none where it is no array. */
function bullets(items: unknown): string[] {
	return elements(items).flatMap((item) => hanging("- ", String(item)));
}

/** Puts `body` in a fence tagged `lang` that no backtick run in it closes. */
function fenced(lang: string, body: string): string[] {
	const longest = Math.max(
		0,
		...[...body.matchAll(/`+/g)].map(([run]) => run.length),
	);
	const fence = "`".repeat(Math.max(3, longest + 1));
	const lines = body.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");

	return [`${fence}${lang}`, ...lines, fence];
}

/** Picks the fence tag for `block`: its `lang`, or the extension of `path`. */
function langOf(block: JsonObject, path: string | undefined): string {
	return text(block["lang"]) ?? extname(path ?? "").slice(1);
}

/**
 * Writes `cells` as one markdown table row, each cell folded onto one line
 * and its pipes escaped.
 */
const tableRow = (cells: unknown[]): string =>
	`| ${cells
		.map((cell) =>
			String(cell ?? "")
				.replace(/\s*\n\s*/g, " ")
				.replace(/\|/g, "\\|"),
		)
		.join(" | ")} |`;

/**
 * Writes a code block: pasted code in a fence under any label, or for code in
 * a file one line naming the place {@link codeSource} gives, and any label.
 */
function codeLines(block: JsonObject): string[] {
	const from = fieldsOf(block["from"]);
	const label = text(block["label"]);
	const pasted = from["text"];

	if (typeof pasted === "string") {
		return [
			...(label === undefined ? [] : [`\`${label}\``]),
			...fenced(text(block["lang"]) ?? "", pasted),
		];
	}

	return [
		`Code at \`${codeSource(from)}\`${label === undefined ? "" : `, ${label}`}`,
	];
}

/** A plan's survey facts by ID. */
type Survey = ReadonlyMap<unknown, JsonObject>;

/** Writes each object in `blocks` in turn, a blank line between each. */
function blockList(blocks: unknown, survey: Survey): string[] {
	return elements(blocks)
		.filter(isTable)
		.flatMap((block, i) => [
			...(i === 0 ? [] : [""]),
			...blockLines(block, survey),
		]);
}

/** Writes a block alone, without its caption or the questions it is about. */
function bodyLines(block: JsonObject, survey: Survey): string[] {
	switch (block["kind"]) {
		case "text":
			return prose(block["markdown"]);

		case "list":
			return bullets(block["items"]);

		case "table": {
			const columns = elements(block["columns"]);

			return [
				tableRow(columns),
				tableRow(columns.map(() => "---")),
				...elements(block["rows"]).map((row) => tableRow(elements(row))),
			];
		}

		case "code":
			return codeLines(block);

		case "diff": {
			const where = text(block["label"]) ?? text(block["gitPath"]);

			return [
				...(where === undefined ? [] : [`Diff of \`${where}\``]),
				...fenced("diff", String(block["patch"] ?? "")),
			];
		}

		case "sketch": {
			const path = text(block["gitPath"]);

			return [
				`Sketch of \`${path ?? "a file"}\`, not exact code`,
				...fenced(langOf(block, path), String(block["text"] ?? "")),
			];
		}

		case "image": {
			const path = text(block["gitPath"]) ?? text(block["absolutePath"]);
			const alt = text(block["alt"]);

			return [
				`Image: \`${path ?? "no path"}\`${alt === undefined ? "" : `, ${alt}`}`,
			];
		}

		case "fact": {
			const fact = survey.get(block["id"]);
			const id = String(block["id"]);

			if (fact === undefined) {
				return [`${id} is not in the survey.`];
			}

			const evidence = [
				...elements(fact["evidence"]),
				...elements(block["evidence"]),
			];
			const shown = blockList(evidence, survey);

			return [
				...hanging(`${id}: `, text(fact["claim"]) ?? ""),
				...(shown.length === 0 ? [] : ["", ...shown]),
			];
		}

		case "row":
			return blockList(block["blocks"], survey);

		default:
			return [
				`A block of kind ${JSON.stringify(block["kind"])}, which this file does not show.`,
			];
	}
}

/** Writes a block whole: caption, body, then the questions it is about. */
function blockLines(block: JsonObject, survey: Survey): string[] {
	const caption = prose(block["caption"]);
	const about = elements(block["about"]).map((id) => `\`${id}\``);

	return [
		...caption,
		...(caption.length === 0 ? [] : [""]),
		...bodyLines(block, survey),
		...(about.length === 0
			? []
			: ["", `About the open questions ${about.join(", ")}.`]),
	];
}

/** Writes an entry's `over` and `why` as labelled lines under it. */
function reasons(entry: JsonObject): string[] {
	const over = text(entry["over"]);
	const why = text(entry["why"]);

	return [
		...(over === undefined ? [] : hanging("  Over: ", over)),
		...(why === undefined ? [] : hanging("  Why: ", why)),
	];
}

/**
 * Writes the user's decisions and open questions `holder`, a plan or a step,
 * carries, with no blank line after the last.
 */
function decisionLines(holder: unknown): string[] {
	const user = userDecisionsIn(holder)
		.filter(isTable)
		.flatMap((decision) => {
			const sketch = text(decision["sketch"]);
			const head = `- \`${decision["key"]}\`${sketch === undefined ? "" : " (a sketch)"}: `;

			return [
				...hanging(head, sketch ?? text(decision["choice"]) ?? ""),
				...reasons(decision),
			];
		});
	const open = openQuestionsIn(holder)
		.filter(isTable)
		.flatMap((question) => {
			const gitPath = text(question["gitPath"]);
			const where =
				question["when"] === "trial"
					? ["  Judged by eye when the step is tried."]
					: gitPath === undefined
						? []
						: [`  Lands in \`${gitPath}\`.`];

			return [
				...hanging(
					`- \`${question["id"]}\`: `,
					text(question["question"]) ?? "",
				),
				...where,
			];
		});

	return [
		...section("### The user's decisions", user),
		...section("### Open questions", open),
	].slice(0, -1);
}

/**
 * Writes the proposals `holder`, a plan or a step, makes, each with its
 * status.
 */
function proposalLines(holder: unknown): string[] {
	return proposalsIn(holder)
		.filter(isTable)
		.flatMap((proposal) => {
			const status = String(proposal["status"] ?? "");
			const words = PROPOSAL_STATUS_WORDS[status] ?? status;

			return [
				...hanging(
					`- \`${proposal["id"]}\` (${words}): `,
					text(proposal["choice"]) ?? "",
				),
				...reasons(proposal),
			];
		});
}

/** Writes step `i` of `steps` in full, in the order an agent works from it. */
function stepLines(steps: unknown[], i: number, survey: Survey): string[] {
	const step = fieldsOf(steps[i]);
	const status = String(step["status"] ?? "");

	return [
		`# Step ${i + 1} of ${steps.length}: ${step["title"] ?? ""}`,
		"",
		`Status: ${STEP_STATUS_WORDS[status] ?? status}.`,
		"",
		...section("## Summary", prose(step["summary"])),
		...section("## Risk it resolves", prose(step["resolvesRisk"])),
		...section("## Once it lands", blockList(step["afterItLands"], survey)),
		...section("## Gate", bullets(step["gate"])),
		...section("## Decisions", decisionLines(step)),
		...section("## Proposals", proposalLines(step)),
		...section("## Relies on", blockList(step["reliesOn"], survey)),
		...section("## The change", blockList(step["proposedChange"], survey)),
	];
}

/**
 * Writes the markdown file an agent works from: the plan's frame, then each
 * step `steps` names, in full.
 *
 * @remarks
 * `steps` holds 0-based indices into the plan's steps, each one there, and
 * the file gives the steps in that order. Prose is wrapped at {@link WIDTH}
 * columns; code, diffs and table rows are not. A code block that points at a
 * file gives its path and lines and none of its text, which the agent reads
 * where it needs it; a block's `resolved` and `error` go unused.
 */
export function renderStepMarkdown(
	{ plan, title }: LoadedPlan,
	steps: readonly number[],
): string {
	const all = elements(plan["steps"]);
	const survey: Survey = new Map(
		elements(plan["survey"])
			.filter(isTable)
			.map((fact) => [fact["id"], fact]),
	);
	const lines = [
		`# ${title}`,
		"",
		...section("## Problem", prose(plan["problem"])),
		...section("## Goal", prose(plan["goal"])),
		...section("## Done when", bullets(plan["doneWhen"])),
		...section("## Not doing", bullets(plan["notDoing"])),
		...section("## Constraints", bullets(plan["constraints"])),
		...section("## Plan-wide decisions", decisionLines(plan)),
		...section("## Plan-wide proposals", proposalLines(plan)),
		...steps.flatMap((i) => stepLines(all, i, survey)),
	];

	return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
