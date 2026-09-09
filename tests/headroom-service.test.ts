import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeadroomService, inspectHeadroomService, resolveHeadroomBinary } from "../ein-pi/agent/lib/headroom-service.ts";
const dirs: string[] = [], services: HeadroomService[] = [], servers: ReturnType<typeof Bun.serve>[] = [];
const env = { ...process.env };
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  servers.splice(0).forEach((server) => server.stop(true));
  for (const key of ["EIN_HEADROOM_BIN", "EIN_HEADROOM_SERVICE_DIR", "ANTHROPIC_API_KEY"]) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key]; }
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
test("external Headroom is observed and never stopped by this session", async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ service: "headroom-proxy", ready: true, version: "test" }) }); servers.push(server);
  const config = { mode: "on" as const, endpoint: `http://127.0.0.1:${server.port}`, timeoutMs: 500 };
  const service = new HeadroomService(); services.push(service);
  expect(await service.start(config)).toContain("externo"); expect(service.owned).toBe(false);
  await service.stop(); expect((await inspectHeadroomService(config)).ready).toBe(true);
});
test("owned service starts, hides provider credentials, coalesces starts and terminates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ein-headroom-service-")); dirs.push(dir);
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("probe") }); const port = probe.port; probe.stop(true);
  const script = join(dir, "server.ts");
  writeFileSync(script, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(join(dir, "env.json"))},JSON.stringify({keyPresent:!!process.env.ANTHROPIC_API_KEY,beacon:process.env.HEADROOM_BEACON})); Bun.serve({hostname:'127.0.0.1',port:${port},fetch:()=>Response.json({service:'headroom-proxy',ready:true,version:'test'})});`);
  const binary = join(dir, "headroom");
  writeFileSync(binary, `#!/bin/sh\nexec '${process.execPath}' '${script}'\n`, { mode: 0o755 });
  process.env.EIN_HEADROOM_BIN = binary; process.env.EIN_HEADROOM_SERVICE_DIR = dir; process.env.ANTHROPIC_API_KEY = "fixture-not-a-real-key";
  expect(resolveHeadroomBinary()).toBe(binary);
  const service = new HeadroomService(); services.push(service);
  const config = { mode: "on" as const, endpoint: `http://127.0.0.1:${port}`, timeoutMs: 500 };
  const results = await Promise.all([service.start(config), service.start(config)]);
  expect(results[0]).toBe(results[1]); expect(service.owned).toBe(true);
  expect(JSON.parse(readFileSync(join(dir, "env.json"), "utf8"))).toEqual({ keyPresent: false, beacon: "off" });
  await service.stop(); expect((await inspectHeadroomService(config)).ready).toBe(false);
}, 10_000);
