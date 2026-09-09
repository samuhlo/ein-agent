import { compressHeadroom, headroomTableText, verifyHeadroomRepresentation, type HeadroomConfig } from "./headroom.ts";
import { inspectHeadroomService } from "./headroom-service.ts";

export async function verifyHeadroomCompatibility(config: HeadroomConfig) {
const endpoint = config.endpoint;
const health = await inspectHeadroomService(config);
if (!health.ready) throw new Error("Headroom service unavailable");
const corpus = [
  { id: "table", required: true, text: JSON.stringify(Array.from({ length: 240 }, (_, id) => ({ id, service: "worker", region: "eu-west", status: id === 17 ? "failed" : "ok", count: 8 }))) },
  { id: "quoted", required: true, text: JSON.stringify(Array.from({ length: 240 }, (_, id) => ({ id, detail: id === 17 ? 'a,b "quoted"\nnew line' : "ordinary detail", active: id % 2 === 0 }))) },
  { id: "logs", required: true, text: Array.from({ length: 320 }, (_, i) => `2026-09-09T08:00:${String(i % 60).padStart(2, "0")}Z ${i === 173 ? "ERROR job-173 EACCES /cache/lock" : "INFO worker health check succeeded; queue=ready; region=eu-west"}`).join("\n") },
];
const results = [];
for (const fixture of corpus) {
  const started = performance.now(), response = await compressHeadroom(fixture.text, config);
  const compact = headroomTableText(response.text), proof = verifyHeadroomRepresentation(fixture.text, compact);
  const savedBytes = Buffer.byteLength(fixture.text) - Buffer.byteLength(compact);
  results.push({ id: fixture.id, proof: proof ?? null, savedBytes, elapsedMs: performance.now() - started, transforms: response.transforms, pass: !!proof && savedBytes > 600 });
}
return { version: 1, service: health.version, endpoint, pass: results.every((row) => row.pass), results };
}
