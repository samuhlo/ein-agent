// =============================================================================
// SDD CLOSE READINESS — PI COMPOSITION
// Conecta la política compartida al estado SDD compuesto por Pi.
// =============================================================================

import { createAssessCloseReadiness } from "./sdd-close-readiness.ts";
import { resolveSddStatus } from "./sdd-routing-runtime.ts";

export const assessCloseReadiness = createAssessCloseReadiness({
	resolveSddStatus,
});
