// PreToolUse guard on SendMessage. A resumed subagent re-reads its whole
// transcript on every turn it takes, at the cached rate while its prompt cache
// is warm, plus one full-price replay first when the cache has expired. Past
// some size a fresh launch that rebuilds only what it needs is cheaper than
// resuming. This hook reads the target subagent's transcript (the last
// assistant entry carries the context size, the cache TTL it was written
// under, and the time) and guards the resume when the context is above
// `large`, or when the cache has expired and the context is above `cold`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPaths, fill, formatTokens, loadConfig } from "./config.mjs";

const TTL_MS = { "5m": 5 * 60_000, "1h": 60 * 60_000 };
const CONSUMED_DIR = join(tmpdir(), "claude-resume-guard");
const ANSWERED = /^Your questions have been answered:/;

const paths = configPaths(process.argv.slice(2));

// --- transcripts -----------------------------------------------------------

function lastUsage(path) {
  const lines = readFileSync(path, "utf8").split("\n");

  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) {
      continue;
    }

    try {
      const j = JSON.parse(lines[i]);

      if (j.type === "assistant" && j.message?.usage) {
        return j;
      }
    } catch {}
  }

  return null;
}

// Whether the user's latest answer approved resuming `to`. Walking back over
// user entries: a human prompt (plain-string content) ends the search, since a
// later message supersedes any answer before it; an AskUserQuestion result
// (a tool_result whose text reads `"question"="answer", ...`) is the answer;
// other tool results are skipped. The chosen answer must be the option
// labeled "Resume"; one answer approves one resume, whichever agent Claude
// then messages, since the question Claude asked named it.
function resumeApproval(path) {
  const lines = readFileSync(path, "utf8").split("\n");

  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) {
      continue;
    }

    try {
      const j = JSON.parse(lines[i]);

      if (j.type !== "user" || j.isMeta) {
        continue;
      }

      const c = j.message?.content;

      if (typeof c === "string") {
        return null;
      }

      if (!Array.isArray(c)) {
        continue;
      }

      for (const b of c) {
        if (b.type !== "tool_result") {
          continue;
        }

        const text = typeof b.content === "string" ? b.content : "";

        if (!ANSWERED.test(text)) {
          continue;
        }

        for (const m of text.matchAll(/"([^"]*)"="([^"]*)"/g)) {
          if (/^resume\b/i.test(m[2].trim())) {
            return { uuid: j.uuid };
          }
        }

        return null;
      }
    } catch {}
  }

  return null;
}

// --- output ----------------------------------------------------------------

function decide(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
}

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => void run());

async function run() {
  try {
    const input = JSON.parse(data || "{}");

    if (input.tool_name !== "SendMessage") {
      process.exit(0);
    }

    if (!paths.defaultsPath) {
      process.exit(0);
    }

    // Read before anything else, so `enabled = false` costs no transcript read.
    const settings = await loadConfig(input.session_id, paths);
    const config = settings.section("resume-guard");
    const messages = settings.section("resume-guard", "messages");

    if (config.enabled === false) {
      process.exit(0);
    }

    const to = String(input.tool_input?.to ?? "")
      .replace(/\s*\[[^\]]*\]\s*$/, "")
      .trim();

    if (!/^[A-Za-z0-9._-]+$/.test(to)) {
      process.exit(0);
    }

    const transcript = String(input.transcript_path);
    const dir = join(transcript.replace(/\.jsonl$/, ""), "subagents");
    const file = join(dir, `agent-${to}.jsonl`);

    if (!existsSync(file)) {
      process.exit(0);
    }

    const entry = lastUsage(file);

    if (!entry) {
      process.exit(0);
    }

    const u = entry.message.usage;
    const context =
      (u.input_tokens || 0) +
      (u.cache_creation_input_tokens || 0) +
      (u.cache_read_input_tokens || 0);
    const ttl =
      (u.cache_creation?.ephemeral_1h_input_tokens || 0) > 0 ? "1h" : "5m";
    const ageMs = Date.now() - Date.parse(entry.timestamp);
    const ageMin = Math.round(ageMs / 60_000);
    const cold = ageMs > TTL_MS[ttl] && context > config.cold;
    const large = context > config.large;

    if (!cold && !large) {
      process.exit(0);
    }

    let type = "subagent";

    try {
      const meta = JSON.parse(
        readFileSync(join(dir, `agent-${to}.meta.json`), "utf8"),
      );

      type = meta.agentType || meta.agent_type || meta.subagentType || type;
    } catch {}

    const size = `${formatTokens(context)} tokens`;
    const why = [];

    if (large) {
      why.push(
        `context ${size} is above the ${formatTokens(config.large)} resume limit: every turn re-reads it`,
      );
    }

    if (cold) {
      why.push(
        `last active ${ageMin} min ago, ${ttl} cache expired: cold full-price replay of ${size}`,
      );
    }

    const values = {
      agent: to,
      type,
      tokens: formatTokens(context),
      reasons: why.join("; "),
      large: formatTokens(config.large),
      cold: formatTokens(config.cold),
    };

    const approval = resumeApproval(transcript);

    if (approval) {
      mkdirSync(CONSUMED_DIR, { recursive: true });

      const marker = join(
        CONSUMED_DIR,
        String(approval.uuid).replace(/[^A-Za-z0-9._-]/g, "_"),
      );

      if (!existsSync(marker)) {
        writeFileSync(marker, new Date().toISOString());
        process.exit(0);
      }

      decide("deny", fill(messages.used, values));

      process.exit(0);
    }

    decide("deny", fill(messages.denied, values));
  } catch {}

  process.exit(0);
}
