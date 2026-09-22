import { randomUUID } from "node:crypto";
import { createPhaseReceiptService } from "./sdd-phase-receipt.ts";
import { readVerificationFreshness } from "./sdd-verification-runtime.ts";

export const phaseReceiptService = createPhaseReceiptService({
	now: () => new Date().toISOString(),
	newToken: randomUUID,
	readVerification: (cwd, changePath) => readVerificationFreshness({ cwd, changePath }),
});

export const { beginPhaseRun, finishPhaseRun, readPhaseRun, assessPhaseRecovery } = phaseReceiptService;
