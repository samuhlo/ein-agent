// =============================================================================
// TESTS: the Pi template ships everything the launchers and installer invoke
// Three releases shipped with `surfaces/` missing from the template allowlist,
// so `ein-pi workbench` and `ein-pi cleaner` never worked from a packaged
// install. These assertions derive what is required from the code that uses it,
// instead of trusting a hand-kept list.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const BUNDLE = readFileSync(join(REPO, "installer", "scripts", "bundle-template.ts"), "utf8");
const PI_LAUNCHER = readFileSync(join(REPO, "ein-pi", "launchers", "ein-pi.fish"), "utf8");
const CLAUDE_LAUNCHER = readFileSync(join(REPO, "ein-cc", "launchers", "ein-cc.fish"), "utf8");
const INSTALL_CLI = readFileSync(join(REPO, "installer", "src", "cli", "install.ts"), "utf8");
const LINEAR_INTEGRATION = readFileSync(join(REPO, "ein-pi", "agent", "lib", "linear-integration.ts"), "utf8");
const AGENT_PROMPT = readFileSync(join(REPO, "ein-pi", "agent", "extensions", "internal", "ein-agent-prompt-hook.ts"), "utf8");
const PERSONA = readFileSync(join(REPO, "ein-pi", "agent", "lib", "persona.ts"), "utf8");

function allowlist(name: string): string[] {
  const match = new RegExp(`const ${name} = \\[([^\\]]*)\\]`, "s").exec(BUNDLE);
  return [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((entry) => entry[1] ?? "");
}

const AGENT_FILES = allowlist("AGENT_FILES");
const AGENT_DIRS = allowlist("AGENT_DIRS");

/** First path segment of an agent-relative path, which is what the allowlist gates. */
function topLevel(path: string): string {
  return path.split("/")[0] ?? path;
}

function covered(path: string): boolean {
  const head = topLevel(path);
  return AGENT_DIRS.includes(head) || AGENT_FILES.includes(head);
}

describe("Pi template agent inventory", () => {
	test("template stages only the target-specific production app under managed bin", () => {
		expect(BUNDLE).toContain('join(staging, "bin", "ein")');
		expect(BUNDLE).toContain("EIN_APP_TARGET");
		expect(BUNDLE).not.toContain("ein-cc-runtime");
	});
  test("provider launchers force separate Engram stores", () => {
    expect(PI_LAUNCHER).toContain('set -fx ENGRAM_DATA_DIR "$HOME/.engram-ein"');
    expect(CLAUDE_LAUNCHER).toContain('set -fx ENGRAM_DATA_DIR "$HOME/.engram-ein"');
  });

  test("every path the launcher invokes under the agent home is shipped", () => {
    const referenced = [...PI_LAUNCHER.matchAll(/\$EIN_PI_AGENT_HOME\/([A-Za-z0-9_./-]+)/g)]
      .map((match) => match[1] ?? "");
    expect(referenced.length).toBeGreaterThan(0);
    for (const path of referenced) {
      expect({ path, shipped: covered(path) }).toEqual({ path, shipped: true });
    }
  });

  test("the precompiled terminal app is promoted from managed bin", () => {
    expect(INSTALL_CLI).toContain('"bin", "ein"');
    expect(AGENT_FILES).toContain("app.ts");
  });

  test("surfaces ship, because the launchers reach the runner by path", () => {
    expect(AGENT_DIRS).toContain("surfaces");
  });

  test("lib ships, because both the app and the runner import it", () => {
    expect(AGENT_DIRS).toContain("lib");
  });

  test("ships the canonical Linear module and dynamic prompt chain without legacy mode", () => {
    expect(AGENT_DIRS).toContain("lib");
    expect(LINEAR_INTEGRATION).toContain("export function readLinearIntegration");
    expect(AGENT_PROMPT).toContain("readLinearIntegration(ctx.cwd)");
    expect(AGENT_PROMPT).toContain("buildEinPrompt(");
    expect(PERSONA).toContain("linearDirective(linear)");
    expect(existsSync(join(REPO, "ein-pi", "agent", "lib", "mode.ts"))).toBe(false);
  });
});
