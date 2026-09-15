import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { removeRetiredSubagentConfig } from "../installer/src/core/subagent-config-compat.ts";
import { installDeclaredPackages } from "../installer/src/core/deps.ts";
import { resolvePiInstallContext } from "../installer/src/core/paths.ts";

const roots: string[] = [];
function fixture(content?: string) {
  const home = mkdtempSync(join(tmpdir(), "ein-config-retirement-"));
  roots.push(home);
  const context = resolvePiInstallContext(home);
  const path = join(context.agentDir, "extensions/subagent/config.json");
  mkdirSync(dirname(path), { recursive: true });
  if (content !== undefined) writeFileSync(path, content, { mode: 0o600 });
  return { context, path };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("retires only modelExclusions, preserving settings, mode and other installations", () => {
  const keep = { control: { needsAttentionAfterMs: 1234 }, custom: { enabled: true }, asyncWidget: false };
  const legacy = JSON.stringify({ ...keep, modelExclusions: { defaultTtlMs: 300000 } });
  const { context, path } = fixture(legacy);
  const other = fixture(legacy);
  expect(removeRetiredSubagentConfig(context.agentDir)).toBe(true);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(keep);
  expect(statSync(path).mode & 0o777).toBe(0o600);
  expect(readFileSync(other.path, "utf8")).toBe(legacy);
  const beforeRetry = statSync(path).mtimeMs;
  expect(removeRetiredSubagentConfig(context.agentDir)).toBe(false);
  expect(statSync(path).mtimeMs).toBe(beforeRetry);
});

test("absent and compatible configurations remain byte-identical", () => {
  const absent = fixture();
  expect(removeRetiredSubagentConfig(absent.context.agentDir)).toBe(false);
  expect(existsSync(absent.path)).toBe(false);
  const content = '{ "asyncWidget": true }';
  const compatible = fixture(content);
  expect(removeRetiredSubagentConfig(compatible.context.agentDir)).toBe(false);
  expect(readFileSync(compatible.path, "utf8")).toBe(content);
});

test.each(["{broken", "null", "[]"])("invalid config %s is preserved", (content) => {
  const { context, path } = fixture(content);
  expect(() => removeRetiredSubagentConfig(context.agentDir)).toThrow();
  expect(readFileSync(path, "utf8")).toBe(content);
});

test("does not follow a config symlink into another installation", () => {
  const target = fixture('{"modelExclusions":{},"custom":true}');
  const linked = fixture();
  symlinkSync(target.path, linked.path);
  expect(() => removeRetiredSubagentConfig(linked.context.agentDir)).toThrow("archivo regular");
  expect(readFileSync(target.path, "utf8")).toBe('{"modelExclusions":{},"custom":true}');
});

test("package maintenance repairs legacy config before invoking Pi, and fails before effects for invalid JSON", async () => {
  const { context, path } = fixture('{"modelExclusions":{},"custom":true}');
  writeFileSync(join(context.agentDir, "settings.json"), JSON.stringify({ packages: ["npm:pi-subagents@latest"] }));
  let calls = 0;
  const deps = {
    lookPath: () => "/fake/pi",
    ensureChildTools: () => {},
    ensureWidget: () => {},
    run: async () => {
      calls++;
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ custom: true });
      return { ok: true, code: 0, stdout: "", stderr: "" };
    },
  };
  expect((await installDeclaredPackages(context, deps)).ok).toBe(true);
  expect(calls).toBe(1);
  writeFileSync(path, "{broken");
  expect(await installDeclaredPackages(context, deps)).toMatchObject({ ok: false });
  expect(calls).toBe(1);
  expect(readFileSync(path, "utf8")).toBe("{broken");
});
