/** Real optional installer smoke, isolated from the user's Pi home. Needs network.
 * Runs on macOS and Linux in CI; tests the official private uv bootstrap too. */
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installHeadroom } from "../installer/src/core/headroom.ts";
import { headroomHomeForAgent, inspectManagedHeadroom } from "../shared/ports/headroom.ts";

const root = mkdtempSync(join(realpathSync(tmpdir()), "ein-headroom-smoke-"));
const agentDir = join(root, "agent"), home = headroomHomeForAgent(agentDir);
let passed = false;
try {
  const first = await installHeadroom(agentDir, { findUv: () => null });
  if (!first.ok) throw new Error(first.detail);
  const before = readdirSync(join(home, "versions")).sort();
  const second = await installHeadroom(agentDir);
  const after = readdirSync(join(home, "versions")).sort();
  if (!second.ok || JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Repeat install allocated another environment: ${second.detail}`);
  const installed = inspectManagedHeadroom(home);
  if (!installed) throw new Error("No verified active version after installation");
  const compatibility = JSON.parse(readFileSync(join(home, "active/verified.json"), "utf8"));
  console.log(JSON.stringify({ platform: process.platform, arch: process.arch, first, second, installed, copiesBefore: before.length, copiesAfter: after.length, compatibility }, null, 2));
  passed = true;
} finally {
  if (passed) rmSync(root, { recursive: true, force: true });
  else console.error(`Headroom install evidence retained at ${root}`);
}
