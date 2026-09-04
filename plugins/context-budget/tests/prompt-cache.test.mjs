// The two things about the cache scan that the end-to-end hook tests cannot
// reach.
//
// The first is a scan that fails: the hook reads the transcript for the
// measurement before it reads it for the snapshot, so a transcript it cannot
// open never gets as far as the snapshot at all. The guarantee -- that a scan
// failure costs the message its cut point and not the notice -- therefore has
// to be asserted here.
//
// The second is a session whose cache lifetime changed part way through. Which
// lifetime a prompt expires on is the one its own preceding turn was billed
// under, not the session's current one, and the difference only shows in the
// expiry arithmetic.
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { cacheSnapshot } from "../hooks/cache-reading.mjs";
import { CHUNK_BYTES, scanCacheWindow } from "../hooks/prompt-cache.mjs";
import { assistant, at, HOUR, prompt } from "./fixtures.mjs";

const FIXTURES = mkdtempSync(join(tmpdir(), "prompt-cache-test-"));
process.on("exit", () => rmSync(FIXTURES, { recursive: true, force: true }));

let seq = 0;
function transcript(...lines) {
  const path = join(FIXTURES, `transcript-${seq++}.jsonl`);
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

test("a transcript that cannot be read fills the placeholder instead of throwing", () => {
  const missing = join(FIXTURES, "no-session-here.jsonl");

  assert.throws(() => scanCacheWindow(missing), { code: "ENOENT" });
  assert.match(
    cacheSnapshot(missing),
    /^Prompt cache: state could not be determined/,
    "the notice still has something to say where the scan has nothing",
  );
});

test("a prompt expires on the lifetime its own preceding turn was billed under", () => {
  const sent = at(20);
  const path = transcript(
    assistant(100_000, { minutesAgo: 45, ttl: "5m" }),
    prompt("The prompt behind the switch to a 1h cache", at(40)),
    assistant(150_000, { minutesAgo: 39, ttl: "1h" }),
    prompt("The prompt whose prefix the 1h turn wrote", sent),
    assistant(200_000, { minutesAgo: 19, ttl: "5m" }),
  );

  const scan = scanCacheWindow(path);

  assert.equal(scan.ttl, "5m", "the session is on 5m: that is its newest split");
  assert.deepEqual(
    scan.prompts.map((p) => p.text),
    ["The prompt whose prefix the 1h turn wrote"],
    "the 5m turn above the older prompt left it cold 35 minutes ago",
  );
  assert.equal(
    scan.prompts[0].expiresAt.getTime(),
    Date.parse(sent) + HOUR,
    "its prefix was written by the 1h turn, so it lives an hour",
  );
  assert.equal(scan.prompts[0].prefixTokens, 150_000);
  assert.equal(scan.above, "colder");
});

test("the prompt a session opened with counts as a cut point above the cached ones", () => {
  // It is the one prompt with no assistant turn before it, so the walk never
  // settles it and reaches the start of the file still holding it. Cold, it is
  // still a selectable prompt above the cached ones -- which is the difference
  // between "there are older cut points and they all cost" and "this is as far
  // back as the session goes", and every real session over an hour old is this
  // case.
  const scan = scanCacheWindow(
    transcript(
      prompt("The prompt this session opened with", at(90)),
      assistant(60_000, { minutesAgo: 89 }),
      prompt("The prompt that is still warm", at(30)),
      assistant(200_000, { minutesAgo: 29 }),
    ),
  );

  assert.deepEqual(
    scan.prompts.map((p) => p.text),
    ["The prompt that is still warm"],
  );
  assert.equal(scan.above, "colder");
});

test("no prompt is lost or mangled where the backward read changes chunk", () => {
  // The scan reads the file end-first in fixed-size byte chunks, and the first
  // seam falls at `size - CHUNK_BYTES` -- so a reader that treats each chunk on
  // its own drops the entry that straddles it, and one that decodes each chunk
  // before joining them mangles the character the seam runs through. Neither
  // shows up in a transcript that happens to seam somewhere harmless, so the
  // file is padded until the seam lands inside a known three-byte character,
  // and both failures are on every run of this test rather than on the ones
  // that get unlucky.
  const MARK = "—";
  const straddled = `The prompt the seam runs ${MARK} through`;
  const words = ["The prompt above the seam", straddled, "The prompt below it"];
  const body = Buffer.from(
    [
      assistant(100_000, { minutesAgo: 50 }),
      ...words.map((text, i) => prompt(text, at(45 - i))),
      assistant(200_000, { minutesAgo: 10 }),
    ].join("\n") + "\n",
  );

  // An entry the scan reads and ignores, sized so that the file ends exactly
  // CHUNK_BYTES past the middle byte of the mark.
  const mark = body.indexOf(Buffer.from(MARK));
  const filler = '{"type":"system","subtype":"filler","content":"';
  const padding = mark + 1 + CHUNK_BYTES - body.length - filler.length - 3;

  assert.ok(padding > 0, `the fixture is too long to seam by ${-padding} bytes`);

  const path = join(FIXTURES, "seam.jsonl");
  writeFileSync(
    path,
    Buffer.concat([
      body,
      Buffer.from(`${filler}${"x".repeat(padding)}"}\n`),
    ]),
  );

  const seam = statSync(path).size - CHUNK_BYTES;

  assert.ok(
    mark < seam && seam < mark + Buffer.byteLength(MARK),
    `the seam is meant to fall inside the mark at ${mark}, and falls at ${seam}`,
  );

  const scan = scanCacheWindow(path);

  assert.deepEqual(
    scan.prompts.map((p) => p.text),
    words,
    "every prompt, oldest first, with its text intact",
  );
  assert.equal(scan.above, "nothing");
});
