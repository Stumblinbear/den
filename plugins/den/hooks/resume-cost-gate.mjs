// PreToolUse gate on SendMessage. A resumed subagent re-reads its whole
// transcript on every turn it takes, at the cached rate while its prompt cache
// is warm, plus one full-price replay first when the cache has expired. Past
// some size a fresh launch that rebuilds only what it needs is cheaper than
// resuming, warm or cold; below it a cold replay is still cheaper than
// re-deriving. This hook reads the target subagent's transcript (the last
// assistant entry carries the context size, the cache TTL it was written
// under, and the time) and gates the resume when the context is above
// LARGE_TOKENS, or when the cache has expired and the context is above
// COLD_TOKENS.
//
// A gated resume is denied with the numbers in the reason, so Claude states
// them and asks through AskUserQuestion with an option labeled "Resume". The
// retry is allowed only when the user's most recent answer in the main
// transcript (an AskUserQuestion tool result, with no later human prompt)
// picked that option, and each answer approves one resume: the answer is
// marked consumed. The approval is read from the transcript, not from
// anything Claude says.
//
// Anything that is not a subagent of this session (teammates, other sessions,
// "main") is left alone. Never fails loudly: any error allows the call.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LARGE_TOKENS = Number(process.env.RESUME_GATE_LARGE_TOKENS || 150_000);
const COLD_TOKENS = Number(process.env.RESUME_GATE_COLD_TOKENS || 50_000);
const TTL_MS = { "5m": 5 * 60_000, "1h": 60 * 60_000 };
const CONSUMED_DIR = join(tmpdir(), "claude-resume-gate");
const ANSWERED = /^Your questions have been answered:/;

function lastUsage(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    try {
      const j = JSON.parse(lines[i]);
      if (j.type === "assistant" && j.message?.usage) return j;
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
    if (!lines[i]) continue;
    try {
      const j = JSON.parse(lines[i]);
      if (j.type !== "user" || j.isMeta) continue;
      const c = j.message?.content;
      if (typeof c === "string") return null;
      if (!Array.isArray(c)) continue;
      for (const b of c) {
        if (b.type !== "tool_result") continue;
        const text = typeof b.content === "string" ? b.content : "";
        if (!ANSWERED.test(text)) continue;
        for (const m of text.matchAll(/"([^"]*)"="([^"]*)"/g)) {
          if (/^resume\b/i.test(m[2].trim())) return { uuid: j.uuid };
        }
        return null;
      }
    } catch {}
  }
  return null;
}

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
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(data || "{}");
    if (input.tool_name !== "SendMessage") process.exit(0);
    const to = String(input.tool_input?.to ?? "").replace(/\s*\[[^\]]*\]\s*$/, "").trim();
    if (!/^[A-Za-z0-9._-]+$/.test(to)) process.exit(0);
    const transcript = String(input.transcript_path);
    const dir = join(transcript.replace(/\.jsonl$/, ""), "subagents");
    const file = join(dir, `agent-${to}.jsonl`);
    if (!existsSync(file)) process.exit(0);
    const entry = lastUsage(file);
    if (!entry) process.exit(0);
    const u = entry.message.usage;
    const context =
      (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const ttl = (u.cache_creation?.ephemeral_1h_input_tokens || 0) > 0 ? "1h" : "5m";
    const ageMs = Date.now() - Date.parse(entry.timestamp);
    const ageMin = Math.round(ageMs / 60_000);
    const cold = ageMs > TTL_MS[ttl] && context > COLD_TOKENS;
    const large = context > LARGE_TOKENS;
    if (!cold && !large) process.exit(0);

    let type = "subagent";
    try {
      const meta = JSON.parse(readFileSync(join(dir, `agent-${to}.meta.json`), "utf8"));
      type = meta.agentType || meta.agent_type || meta.subagentType || type;
    } catch {}
    const size = `${(context / 1000).toFixed(1)}K tokens`;
    const why = [];
    if (large) why.push(`context ${size} is above the ${LARGE_TOKENS / 1000}K resume limit: every turn re-reads it`);
    if (cold) why.push(`last active ${ageMin} min ago, ${ttl} cache expired: cold full-price replay of ${size}`);
    const facts = `Resume of ${type} ${to}: ${why.join("; ")}.`;

    const approval = resumeApproval(transcript);
    if (approval) {
      mkdirSync(CONSUMED_DIR, { recursive: true });
      const marker = join(CONSUMED_DIR, String(approval.uuid).replace(/[^A-Za-z0-9._-]/g, "_"));
      if (!existsSync(marker)) {
        writeFileSync(marker, new Date().toISOString());
        process.exit(0);
      }
      decide(
        "deny",
        `${facts} The user's latest answer has already been used for one resume of this agent; ask again before another.`,
      );
      process.exit(0);
    }
    decide(
      "deny",
      `${facts} Gated: state these numbers to the user, then call AskUserQuestion naming the agent in the question, with an option labeled "Resume" and an option "Fresh launch". Retry this call only if the user picks Resume; otherwise launch fresh or stop.`,
    );
  } catch {}
  process.exit(0);
});
