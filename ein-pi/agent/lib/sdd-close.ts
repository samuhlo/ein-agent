// =============================================================================
// SDD CLOSE — PI COMPOSITION
// Conecta el motor compartido al routing, readiness e identidad Git de Pi.
// =============================================================================

import { createCloseChange } from "./sdd-close-engine.ts";
import { readRepositoryStateIdentity } from "./git-baseline.ts";
import { assessCloseReadiness } from "./sdd-close-readiness-runtime.ts";
import { resolveSddStatus } from "./sdd-routing-runtime.ts";

export { closedChangePath } from "./sdd-close-engine.ts";
export type {
	CloseBlocker,
	CloseCompactionTestSeam,
	CloseOptions,
	CloseResult,
} from "./sdd-close-engine.ts";

export const closeChange = createCloseChange({
	assessCloseReadiness,
	resolveSddStatus,
	readRepositoryStateIdentity,
});
