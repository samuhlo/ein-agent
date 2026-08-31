// Public boundary for the shared doctor engine while its implementation
// remains deployed as part of the Pi runtime payload.
export {
	doctorCheck,
	doctorWarn,
	inspectCommonDoctor,
	summarizeDoctorChecks,
	type DoctorCheckGroup,
	type DoctorCheckLevel,
	type DoctorCheckResult,
	type DoctorResult,
} from "../../ein-pi/agent/lib/doctor-core.ts";
