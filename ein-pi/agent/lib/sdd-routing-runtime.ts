// =============================================================================
// PI SDD ROUTING ADAPTER
// Connects the runtime-neutral routing core to the two inputs whose persistence
// is still owned by Pi: the declared lane and normalized OpenSpec provenance.
// =============================================================================

import { createSddRoutingCore } from "./sdd-routing-core.ts";
import { readOpenSpecState } from "./sdd-guardrails.ts";
import { readChangeLane } from "./sdd-lane.ts";

const routing = createSddRoutingCore({
	readLane: readChangeLane,
	readSpecState: readOpenSpecState,
});

export const {
	listActiveChangeSummaries,
	resolveSddNext,
	resolveSddStatus,
} = routing;
