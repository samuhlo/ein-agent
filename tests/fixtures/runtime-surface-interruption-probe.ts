import { retireOwnedLegacyRuntimeArtifacts } from "../../installer/src/core/runtime-surface-transaction.ts";

const [home, transactionId] = process.argv.slice(2);
if (!home || !transactionId) throw new Error("usage: runtime-surface-interruption-probe <home> <transaction-id>");

retireOwnedLegacyRuntimeArtifacts({
	home,
	target: "pi",
	validatedCurrentArtifacts: true,
	transactionId,
	fault: (point) => {
		// Support the old hook so this fixture also proves the pre-fix process can die after the rename.
		if (point === "after-rename-before-publish:LEGACY_PI_LAUNCHER" || point === "after-move:LEGACY_PI_LAUNCHER") {
			process.kill(process.pid, "SIGKILL");
		}
	},
});
