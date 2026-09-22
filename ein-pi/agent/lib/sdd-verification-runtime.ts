import { randomUUID } from "node:crypto";

import { createVerificationService } from "./sdd-verification-receipt.ts";
import { enumerateVerificationGit } from "./verification-surface-git.ts";

export const verificationService = createVerificationService({
	enumerateGit: enumerateVerificationGit,
	now: () => new Date().toISOString(),
	newToken: randomUUID,
});

export const { beginVerification, finishVerification, readVerificationFreshness } = verificationService;
