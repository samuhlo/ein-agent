import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeLegacyEngramMcp } from "../ein-cc/sync.ts";

test("retires the managed Claude MCP entry without changing other servers or user data", () => {
  const root = mkdtempSync(join(tmpdir(), "ein-claude-mcp-retirement-"));
  const configPath = join(root, ".claude.json");
  const database = join(root, "engram.db");
  const remaining = { context7: { command: "bunx", args: ["@upstash/context7-mcp"] }, custom: { url: "https://example.invalid/mcp" } };
  try {
    expect(removeLegacyEngramMcp(configPath, root)).toBe(false);
    writeFileSync(database, "existing user data");
    writeFileSync(configPath, JSON.stringify({ preferences: { theme: "dark" }, mcpServers: { ...remaining, engram: { type: "stdio", command: "/usr/local/bin/engram", args: ["mcp", "--tools=agent"], env: { ENGRAM_DATA_DIR: join(root, ".engram-ein") } } } }));
    expect(removeLegacyEngramMcp(configPath, root)).toBe(true);
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ preferences: { theme: "dark" }, mcpServers: remaining });
    const first = readFileSync(configPath, "utf8");
    expect(removeLegacyEngramMcp(configPath, root)).toBe(false);
    expect(readFileSync(configPath, "utf8")).toBe(first);
    expect(readFileSync(database, "utf8")).toBe("existing user data");

    const custom = JSON.stringify({ mcpServers: { engram: { command: "custom-server", args: [] } } });
    writeFileSync(configPath, custom);
    expect(removeLegacyEngramMcp(configPath, root)).toBe(false);
    expect(readFileSync(configPath, "utf8")).toBe(custom);
    const managed = { type: "stdio", command: "/usr/local/bin/engram", args: ["mcp", "--tools=agent"], env: { ENGRAM_DATA_DIR: join(root, ".engram-ein") } };
    for (const entry of [
      { ...managed, env: { ENGRAM_DATA_DIR: join(root, "another-store") } },
      { ...managed, args: [...managed.args, "--custom"] },
      { ...managed, env: { ...managed.env, EXTRA: "preserve" } },
      { ...managed, environment: managed.env },
      { ...managed, type: "custom" },
      { ...managed, type: undefined },
    ]) {
      const original = JSON.stringify({ mcpServers: { engram: entry } }, null, 4) + "\n";
      writeFileSync(configPath, original);
      expect(removeLegacyEngramMcp(configPath, root)).toBe(false);
      expect(readFileSync(configPath, "utf8")).toBe(original);
    }
    const valid = JSON.stringify({ mcpServers: { engram: managed } });
    writeFileSync(configPath, valid);
    for (const invalidHome of ["", "relative/home"]) {
      expect(removeLegacyEngramMcp(configPath, invalidHome)).toBe(false);
      expect(readFileSync(configPath, "utf8")).toBe(valid);
    }
    writeFileSync(configPath, "invalid json");
    expect(() => removeLegacyEngramMcp(configPath, root)).toThrow();
    expect(readFileSync(configPath, "utf8")).toBe("invalid json");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
