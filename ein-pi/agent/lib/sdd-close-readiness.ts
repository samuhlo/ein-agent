// =============================================================================
// SDD CLOSE READINESS — PI COMPOSITION
// Conecta la política compartida al estado SDD compuesto por Pi.
// =============================================================================

import { createAssessCloseReadiness } from "../../../shared/sdd/sdd-close-readiness.ts";
import { resolveSddStatus } from "./sdd-routing-runtime.ts";

export * from "../../../shared/sdd/sdd-close-readiness.ts";

export const assessCloseReadiness = createAssessCloseReadiness({
	resolveSddStatus,
});
