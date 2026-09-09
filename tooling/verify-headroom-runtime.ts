/** Verify a real local Headroom release without calling a model. */
import { writeFileSync } from "node:fs";
import { headroomConfig } from "../ein-pi/agent/lib/headroom.ts";
import { verifyHeadroomCompatibility } from "../ein-pi/agent/lib/headroom-compatibility.ts";
const config = headroomConfig({ EIN_HEADROOM_MODE: "on", EIN_HEADROOM_URL: process.argv[2] ?? "http://127.0.0.1:8787", EIN_HEADROOM_TIMEOUT_MS: "5000" });
const result = await verifyHeadroomCompatibility(config);
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
