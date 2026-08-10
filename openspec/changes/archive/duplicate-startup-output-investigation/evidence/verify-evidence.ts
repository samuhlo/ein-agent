import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;
const readJson = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const readJsonLines = (name: string) => readFileSync(join(dir, name), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse);

const metadata = readJson("pty-capture-metadata.json");
const result = readJson("pty-result.json");
const summary = readJson("startup-run-summary.json");
const events = readJsonLines("startup-provenance.jsonl");
const presentations = readJsonLines("pty-presentations.jsonl");
const raw = readFileSync(join(dir, "pty-startup.raw"));

if (result.exitCode !== 0 || result.terminatedAtDeadline) throw new Error("PTY did not exit cleanly");
if (events.length !== 3 || events.map((event) => event.eventType).join(",") !== "load,registration,session_start") {
  throw new Error("unexpected side-channel sequence");
}
if (new Set(events.map((event) => event.diagnosticRunId)).size !== 1 || events[0].diagnosticRunId !== result.diagnosticRunId) {
  throw new Error("run identity mismatch");
}
if (events[1].parentEventId !== events[0].eventId || events[2].parentEventId !== events[1].eventId) {
  throw new Error("parent link mismatch");
}
if (events.some((event) => event.processIdentity.state !== "observed"
  || event.processIdentity.value.pid !== metadata.process.pi.pid
  || event.processIdentity.value.ppid !== metadata.process.pi.ppid)) {
  throw new Error("process identity mismatch");
}
if (presentations.length !== 1
  || presentations[0].channel.value !== "banner-stdout-redraw"
  || presentations[0].parentEventId.state !== "unknown") {
  throw new Error("presentation attribution mismatch");
}
const rawDigest = createHash("sha256").update(raw).digest("hex");
if (rawDigest !== metadata.captureFiles.rawPty.sha256) throw new Error("raw hash mismatch");
if (summary.classification.kind !== "unknown" || summary.classification.reason !== "missing-evidence") {
  throw new Error("classification must fail closed");
}
if (summary.stages.notificationEmissions.count.state !== "unknown"
  || summary.presentationBreakdown.notificationOverlay.count.state !== "unknown") {
  throw new Error("missing evidence was converted into zero");
}

console.log(`capture evidence valid: run=${result.diagnosticRunId}, events=${events.length}, presentations=${presentations.length}, classification=unknown/missing-evidence`);
