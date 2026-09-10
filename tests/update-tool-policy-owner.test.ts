import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnContinuation } from "../installer/src/core/child-continuation.ts";
import { defaultUpdateCaps } from "../installer/src/core/update-caps.ts";
import { INSTALLER_VERSION } from "../installer/src/core/version.ts";
import { normalizeTag } from "../installer/src/core/release-resolver.ts";

const tag = normalizeTag(`installer-v${INSTALLER_VERSION}`);
if (!tag.ok) throw new Error("invalid test release tag");

test("the installed CLI owns external maintenance and rejects a wrong release before effects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ein-policy-entry-"));
  try {
    for (const valid of [true, false]) {
      const log = join(dir, `${valid}.log`);
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures/installed-tool-policy-child.ts"),
        "--ein-continuation=policy-fixture", `--ein-release=${valid ? tag.value : "installer-v999.0.0"}`, "--ein-runtime-surfaces=external-tools"],
        { env: { ...process.env, EIN_TEST_TOOL_POLICY_LOG: log }, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(code, stderr).toBe(valid ? 0 : 1);
      const result = JSON.parse(stdout);
      expect(result.status).toBe(valid ? "ok" : "failed");
      if (valid) {
        expect(result.externalTools).toEqual([{ ok: true, detail: "new-policy tool only" }]);
        expect(readFileSync(log, "utf8")).toBe("new-policy\n");
      } else expect(existsSync(log)).toBe(false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 15000);

test("external-tool continuation fails closed for an unsupported or malformed candidate", async () => {
  for (const payload of [undefined, [{ ok: "yes", detail: "wrong" }], [{ ok: true }]]) {
    const base = defaultUpdateCaps();
    const result = await spawnContinuation({ candidatePath: "/installed/ein-install", txId: "policy", releaseTag: tag.value, runtimeSurfaces: "external-tools",
      caps: { ...base, child: { spawn: async () => ({ code: 0, stdout: JSON.stringify({ txId: "policy", releaseTag: tag.value,
        binaryVersion: INSTALLER_VERSION, templateVersion: INSTALLER_VERSION, status: "ok", externalTools: payload }) }) } } });
    expect(result.ok).toBe(false);
  }
});
