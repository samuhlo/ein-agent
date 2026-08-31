// Public boundary for the Linear integration still implemented by the Pi
// adapter. Consumers outside Pi depend on this port, never on adapter internals.
export {
	LINEAR_INTEGRATION_OPTIONS,
	globalLinearIntegrationConfigPath,
	type LinearIntegration,
} from "../../ein-pi/agent/lib/linear-integration.ts";
