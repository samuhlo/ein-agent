import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeApplyProgress, normalizeApplyProgressWrite } from "../shared/sdd/sdd-apply-progress.ts";
import { updateSddTaskProgress } from "../shared/sdd/sdd-task-progress.ts";
import { readSddCompletionEvidence } from "../shared/sdd/sdd-routing-core.ts";
import { reconcilePhaseFailure } from "../ein-pi/agent/lib/sdd-reconcile.ts";
import { readVerificationFreshness } from "../ein-pi/agent/lib/sdd-verification-runtime.ts";
const readVerification = (cwd: string, changePath: string) => readVerificationFreshness({ cwd, changePath });

test("one group cannot complete the whole change; both runtimes repair existing report metadata", () => {
 const cwd=mkdtempSync(join(tmpdir(),"ein-honest-progress-"));const dir=join(cwd,"openspec/changes/probe");mkdirSync(dir,{recursive:true});
 try {
  writeFileSync(join(dir,"tasks.md"),"status: ready\n- [ ] 1.1 First\n- [ ] 2.1 Next\n");
  const original="status: complete\n\n## First\nImplemented first group.\nstatus: complete\n\n```text\nstatus: blocked\nHistorical diagnostic\n```\n";
  writeFileSync(join(dir,"apply-progress.md"),original);
  expect(readSddCompletionEvidence(cwd,"probe",readVerification).apply).toBe("partial");
  expect(readFileSync(join(dir,"apply-progress.md"),"utf8")).toBe(original);
  updateSddTaskProgress(cwd,"probe","1.1","start");updateSddTaskProgress(cwd,"probe","1.1","complete");
  const report=readFileSync(join(dir,"apply-progress.md"),"utf8");
  expect(report).toStartWith("status: partial\n");expect(report).toContain("status: blocked\nHistorical diagnostic");
  expect(report.match(/^status: complete$/gm)).toBeNull();
  expect(normalizeApplyProgress(report,1,2)).toBe(report);
  expect(normalizeApplyProgressWrite(cwd,"other.md",original)).toBe(original);
  updateSddTaskProgress(cwd,"probe","2.1","start");updateSddTaskProgress(cwd,"probe","2.1","complete");
  expect(readFileSync(join(dir,"apply-progress.md"),"utf8")).toStartWith("status: complete\n");
 } finally {rmSync(cwd,{recursive:true,force:true});}
});

test("a passing heading cannot override admitted missing coverage or rescue a failed phase", () => {
 const cwd=mkdtempSync(join(tmpdir(),"ein-honest-verify-"));const dir=join(cwd,"openspec/changes/probe");mkdirSync(dir,{recursive:true});
 try {
  writeFileSync(join(dir,"tasks.md"),"status: ready\n- [ ] 1.1 Pending\n");
  writeFileSync(join(dir,"apply-progress.md"),"status: complete\n");
  expect(reconcilePhaseFailure(cwd,"apply",{}).reconciled).toBe(false);
  for (const outcome of ["partial","none"]) {
   writeFileSync(join(dir,"verify-report.md"),`status: pass\nbehavior_coverage: ${outcome}\n`);
   expect(readSddCompletionEvidence(cwd,"probe",readVerification).verify).toBe("fail");
   expect(reconcilePhaseFailure(cwd,"verify",{}).reconciled).toBe(false);
  }
  writeFileSync(join(dir,"verify-report.md"),"status: fail\nbehavior_coverage: verified\n");
  expect(reconcilePhaseFailure(cwd,"verify",{}).reconciled).toBe(false);
 } finally {rmSync(cwd,{recursive:true,force:true});}
});

test("historical group failures stay in the narrative without becoming the current global blocker", () => {
 const report=normalizeApplyProgress("status: partial\n## Earlier group\nstatus: blocked\nOriginal failure retained.\n",1,2);
 expect(report).toStartWith("status: partial\n");expect(report).toContain("Reported group status: blocked");
 expect(normalizeApplyProgress(report,1,2)).toBe(report);
 expect(normalizeApplyProgress("status: blocked\nCurrent impediment",1,2)).toStartWith("status: blocked");
 expect(normalizeApplyProgress("status: blocked\nRetained failure",1,2,false)).toStartWith("status: partial");
});
