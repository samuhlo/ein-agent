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

test("the installed CLI owns Pi maintenance and checks identity before touching packages", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ein-pi-policy-"));
  try {
    for (const valid of [true, false]) {
      const log = join(dir, `${valid}.log`);
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures/installed-tool-policy-child.ts"),
        "--ein-continuation=pi-policy", `--ein-release=${valid ? tag.value : "installer-v999.0.0"}`, "--ein-runtime-surfaces=pi-runtime"],
        { env: { ...process.env, EIN_TEST_TOOL_POLICY_LOG: log }, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(code, stderr).toBe(valid ? 0 : 1);
      if (valid) {
        expect(JSON.parse(stdout).piRuntime).toEqual({ pi: { ok: true, detail: "new Pi policy" }, packages: { ok: true, detail: "new package compatibility" } });
        expect(readFileSync(log, "utf8")).toBe("new-pi\nnew-packages\n");
      } else expect(existsSync(log)).toBe(false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Pi maintenance rejects missing or malformed results and carries a package failure", async () => {
  for (const piRuntime of [undefined, {}, { pi: { ok: "yes", detail: "bad" }, packages: { ok: true, detail: "ok" } },
    { pi: { ok: true, detail: "Pi updated" }, packages: { ok: false, detail: "Unknown package contract" } }]) {
    const base = defaultUpdateCaps();
    const result = await spawnContinuation({ candidatePath: "/installed/ein-install", txId: "pi-policy", releaseTag: tag.value, runtimeSurfaces: "pi-runtime",
      caps: { ...base, child: { spawn: async () => ({ code: 0, stdout: JSON.stringify({ txId: "pi-policy", releaseTag: tag.value,
        binaryVersion: INSTALLER_VERSION, templateVersion: INSTALLER_VERSION, status: "ok", piRuntime }) }) } } });
    expect(result.ok).toBe(piRuntime?.pi?.ok === true);
    if (result.ok) expect(result.value.piRuntime?.packages.ok).toBe(false);
  }
});
