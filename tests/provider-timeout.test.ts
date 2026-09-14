import { test, expect } from "bun:test";
import { join } from "node:path";
test("native HTTP timeout smoke runs in an isolated process", () => {
 const result=Bun.spawnSync([process.execPath,"test",join(import.meta.dir,"fixtures/provider-timeout.case.ts")],{stdout:"pipe",stderr:"pipe"});
 expect(result.exitCode,result.stderr.toString()).toBe(0);
 expect(result.stderr.toString()).toContain("2 pass");
});
