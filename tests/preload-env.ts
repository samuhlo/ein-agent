import { afterAll } from "bun:test";
import { join } from "node:path";

import { getRuntimeTestOwner } from "./fixtures/runtime-test-fixture";
import { missingDepsMessage, missingWorkspaceDeps } from "./fixtures/workspace-deps";

// CORTE -> sin las dos instalaciones la suite escupe 16-19 rojos que parecen
// tests rotos y no lo son. Vale más un mensaje que diga qué escribir que veinte
// diffs crípticos. Este preload corre en TODA ejecución de `bun test`.
const missingDeps = missingWorkspaceDeps(join(import.meta.dir, ".."));
if (missingDeps.length > 0) {
	console.error(missingDepsMessage(missingDeps));
	process.exit(1);
}

const owner = getRuntimeTestOwner();
if (process.env.EIN_FIXTURE_MANUAL_PRELOAD !== "1") {
	afterAll(async () => {
		await owner.dispose();
	});
}
