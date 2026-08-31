// Public boundary for the continuity engine shared by the Pi and Claude
// adapters. Its implementation can move without changing either consumer.
export { CONTINUITY_CHECKPOINT_LIMITS } from "../../ein-pi/agent/lib/continuity-checkpoint.ts";
export {
	createContinuityHandoffLifecycle,
	localExecutableAvailable,
	type ContinuityHandoffLifecycle,
} from "../../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";
export { runContinueInPty } from "../../ein-pi/agent/lib/terminal-continue-transport.ts";
