// =============================================================================
// SDD CLOSE — PI COMPOSITION
// Conecta el motor compartido al routing, readiness e identidad Git de Pi.
// =============================================================================

import { createCloseChange } from "./sdd-close-engine.ts";
import { readRepositoryStateIdentity } from "./git-baseline.ts";
import { assessCloseReadiness } from "./sdd-close-readiness-runtime.ts";
import { resolveSddStatus } from "./sdd-routing-runtime.ts";
import { withIntentAdmissionLock } from "./intent-draft-store.ts";
import { createIntentDraftRuntime } from "./intent-draft-runtime.ts";

export { closedChangePath } from "./sdd-close-engine.ts";
export type {
	CloseBlocker,
	CloseCompactionTestSeam,
	CloseOptions,
	CloseResult,
} from "./sdd-close-engine.ts";

export const closeChange = createCloseChange({
	withIntentAdmissionLock: (cwd, work, action) => withIntentAdmissionLock(cwd, work, action, createIntentDraftRuntime(cwd, { mutating: true, lockOnly: true })),
	assessCloseReadiness,
	resolveSddStatus,
	readRepositoryStateIdentity,
});
