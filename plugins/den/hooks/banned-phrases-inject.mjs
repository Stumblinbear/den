// SessionStart and PostModelSwitch hook. Prints banned-phrases.md into the
// main session's context when the active model is Opus 5; other models get
// nothing. The list is model-specific (those phrases are Opus 5 habits), and
// SessionStart never fires for subagents, so keeping it out of the skill keeps
// it off every other model and every subagent. The model comes from the hook
// input (`model` on SessionStart, `to_model` on PostModelSwitch); SessionStart
// does not always include it, so the settings.json model is the fallback.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OPUS5 = /opus-5\b/;

function settingsModel() {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8")).model || "";
  } catch {
    return "";
  }
}

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(data || "{}");
    const model = String(input.to_model || input.model || settingsModel());
    if (!OPUS5.test(model)) process.exit(0);
    const list = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "banned-phrases.md"), "utf8");
    process.stdout.write("Writing rule for this model:\n\n" + list);
  } catch {}
  process.exit(0);
});
