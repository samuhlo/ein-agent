import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readUserSettings, mergeUserSettings } from "../installer/src/core/settings.ts";
import { ensurePhaseRuntime } from "../ein-pi/agent/lib/sdd-preflight.ts";

const template=JSON.parse(readFileSync(join(import.meta.dir,"../ein-pi/agent/settings.json"),"utf8"));
test("the phase deadline remains separate from provider timeouts", () => {
 const request={agent:"sdd-apply",task:"Implement agreed task"};ensurePhaseRuntime(request);
 expect(request).toMatchObject({maxRuntimeMs:1800000});
});

test("updates retire only the old factory retry profile and preserve deliberate overrides", () => {
 const dir=mkdtempSync(join(tmpdir(),"ein-provider-policy-"));
 try {
  const path=join(dir,"settings.json");
  writeFileSync(path,JSON.stringify({retry:{enabled:true,maxRetries:6,baseDelayMs:2000,provider:{maxRetryDelayMs:60000}}}));
  expect(readUserSettings(dir).retry).toBeUndefined();
  writeFileSync(path,JSON.stringify({retry:{maxRetries:2,provider:{timeoutMs:9000}},httpIdleTimeoutMs:0,defaultModel:"chosen"}));
  const saved=readUserSettings(dir);writeFileSync(path,JSON.stringify(template));mergeUserSettings(dir,saved);
  const restored=JSON.parse(readFileSync(path,"utf8"));
  expect(restored).toMatchObject({defaultModel:"chosen",httpIdleTimeoutMs:0,retry:{maxRetries:2,provider:{timeoutMs:9000,maxRetries:0}}});
 } finally {rmSync(dir,{recursive:true,force:true});}
});
