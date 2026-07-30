// =============================================================================
// PUERTAS DE RECIBO DE ENTREGA — núcleo de decisión (slice 04)
// =============================================================================
// Un commit, push o PR puede divergir del contenido que superó la verificación.
// Este módulo decide, en cada frontera, si lo que se va a entregar SIGUE siendo
// el candidato verificado.
//
// Es deliberadamente PURO: no observa git, recibe las lecturas inyectadas. Así
// la decisión se prueba sin repo y quien observa (`delivery-gate.ts`) queda
// separado de quien juzga. Dos controles distintos conviven sin mezclarse: la
// INTENCIÓN del usuario autoriza la acción (el grant de entrega, que este slice
// no toca) y el RECIBO autoriza el contenido.
//
// La regla que atraviesa todo el fichero: ninguna frontera se fía de la
// anterior. Se revalida el recibo en cada una y se releen las identidades,
// porque entre dos fronteras cabe un hook de git, una rama que se mueve o un
// recibo reemplazado.
// =============================================================================

import { validateFreshCandidateReceipt, type CandidateReceipt } from "./candidate-receipt.ts";
import { isSafeChangeName } from "./sdd-router.ts";

export const NO_VERIFICATION_RECEIPT_APPLIES = "no-verification-receipt-applies" as const;

export type DeliveryContentAuthority =
	| { mode: "verified-sdd"; change: string }
	| { mode: "mechanical-unverified"; declaration: typeof NO_VERIFICATION_RECEIPT_APPLIES };

export type ContentAuthorityDeclaration =
	| { ok: true; authority: DeliveryContentAuthority }
	| { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// La autoridad de contenido se DECLARA. Un recibo ausente jamás selecciona el
// carril mecánico: si la ausencia de evidencia bastara para decir "esto no
// necesita evidencia", cualquier fallo al emitir el recibo se convertiría en
// permiso para entregar sin verificar. La declaración tiene que ser un acto.
export function parseContentAuthorityDeclaration(value: unknown): ContentAuthorityDeclaration {
	if (!isRecord(value)) return { ok: false, reason: "falta una declaración de autoridad de contenido" };
	if (value.mode === "verified-sdd") {
		if (Object.keys(value).length !== 2 || typeof value.change !== "string" || !isSafeChangeName(value.change)) {
			return { ok: false, reason: "verified-sdd requiere un cambio seguro y nombrado" };
		}
		return { ok: true, authority: { mode: "verified-sdd", change: value.change } };
	}
	if (value.mode === "mechanical-unverified") {
		if (Object.keys(value).length !== 2 || value.declaration !== NO_VERIFICATION_RECEIPT_APPLIES) {
			return { ok: false, reason: "mechanical-unverified requiere la declaración literal no-verification-receipt-applies" };
		}
		return { ok: true, authority: { mode: "mechanical-unverified", declaration: NO_VERIFICATION_RECEIPT_APPLIES } };
	}
	return { ok: false, reason: "la declaración de autoridad de contenido no es válida" };
}

// Las cuatro fronteras donde el contenido puede divergir. Están separadas
// porque entre una y otra ocurren cosas: los hooks de git corren DESPUÉS del
// pre-commit, y una rama puede moverse DESPUÉS del post-commit.
export type DeliveryGateBoundary = "pre-commit" | "post-commit" | "pre-push" | "pre-pr";

export type VerifyReroute = {
	next: "sdd-verify";
	instruction: "return to sdd-verify, re-verify, emit a new receipt, and restart delivery";
};

export type DeliveryGateDecision =
	| { ok: true; boundary: DeliveryGateBoundary }
	| { ok: false; boundary: DeliveryGateBoundary; reason: string; reroute: VerifyReroute };

export function passDeliveryGate(boundary: DeliveryGateBoundary): DeliveryGateDecision {
	return { ok: true, boundary };
}

export function rerouteToVerify(): VerifyReroute {
	return {
		next: "sdd-verify",
		instruction: "return to sdd-verify, re-verify, emit a new receipt, and restart delivery",
	};
}

export function failDeliveryGate(boundary: DeliveryGateBoundary, reason: string): DeliveryGateDecision {
	return { ok: false, boundary, reason, reroute: rerouteToVerify() };
}

type StringObservation = () => string | null;

export type PreCommitObservations = { baseHead: StringObservation; candidateTree: StringObservation; indexTree: StringObservation };

export type PostCommitObservations = { head: StringObservation; headTree: StringObservation };

// Estado que enhebra las cuatro fronteras. El `receiptFingerprint` fija UN
// recibo concreto para todo el intento: si alguien lo reemplaza a mitad, las
// fronteras siguientes lo detectan en vez de validar contra otra evidencia.
// `validatedDeliveryHead` solo existe tras un post-commit limpio — es el único
// SHA que puede publicarse.
export type VerifiedDeliveryAttempt = {
	receiptFingerprint: string;
	validatedDeliveryHead?: string;
};

export type CandidateReceiptRetirementIdentity = {
	remoteRepository: string;
	baseRef: string;
	headRef: string;
	prNumber: number;
};

// Solo contiene campos que el adaptador remoto debe leer del PR identificado.
// No acepta un resumen de éxito ni nombres locales como prueba de integración.
export type NormalizedMergedPullRequestObservation = {
	repository: string;
	prNumber: number;
	url: string;
	state: "MERGED" | "OPEN" | "CLOSED" | string;
	headRepository: string;
	headRef: string;
	headRefOid: string;
	baseRef: string;
	mergeCommitOid: string;
};

export type CandidateReceiptRetirementInput = {
	activeReceiptFingerprint: string;
	receipt: CandidateReceipt;
	attempt: VerifiedDeliveryAttempt | undefined;
	repositoryId: string;
	worktreeId: string;
	identity: CandidateReceiptRetirementIdentity;
	observation: NormalizedMergedPullRequestObservation | undefined;
};

export type CandidateReceiptRetirementDecision =
	| { ok: true; result: "retire"; observation: NormalizedMergedPullRequestObservation }
	| { ok: false; reason: string };

function hasText(value: string): boolean {
	return value.trim().length > 0;
}

// Política pura: el adaptador debe aportar una observación fresca, pero esta
// función solo acepta identidades ya normalizadas y las ata al recibo activo.
export function evaluateCandidateReceiptRetirement(input: CandidateReceiptRetirementInput): CandidateReceiptRetirementDecision {
	const { receipt, attempt, identity, observation } = input;
	if (!/^[a-f0-9]{64}$/.test(input.activeReceiptFingerprint)) return { ok: false, reason: "el fingerprint activo no es válido" };
	if (!attempt?.receiptFingerprint || attempt.receiptFingerprint !== input.activeReceiptFingerprint) {
		return { ok: false, reason: "el intento no corresponde a los bytes activos del recibo" };
	}
	if (!attempt.validatedDeliveryHead) return { ok: false, reason: "el intento no tiene un HEAD de entrega validado" };
	if (receipt.repositoryId !== input.repositoryId || receipt.worktreeId !== input.worktreeId) {
		return { ok: false, reason: "el recibo no corresponde al repositorio o worktree actual" };
	}
	if (![identity.remoteRepository, identity.baseRef, identity.headRef].every(hasText) || !Number.isSafeInteger(identity.prNumber) || identity.prNumber < 1) {
		return { ok: false, reason: "la identidad explícita de entrega no es válida" };
	}
	if (!observation) return { ok: false, reason: "no hay una observación remota de PR" };
	if (observation.state !== "MERGED" || !hasText(observation.mergeCommitOid)) {
		return { ok: false, reason: "el PR identificado no está merged con resultado de merge" };
	}
	if (observation.repository !== identity.remoteRepository || observation.headRepository !== identity.remoteRepository) {
		return { ok: false, reason: "el PR no pertenece al repositorio remoto identificado" };
	}
	if (observation.prNumber !== identity.prNumber || observation.baseRef !== identity.baseRef || observation.headRef !== identity.headRef) {
		return { ok: false, reason: "el PR observado no coincide con la identidad explícita de entrega" };
	}
	if (!hasText(observation.url) || observation.headRefOid !== attempt.validatedDeliveryHead) {
		return { ok: false, reason: "la cabeza observada del PR no coincide con el HEAD de entrega validado" };
	}
	return { ok: true, result: "retire", observation };
}

export type ReceiptGateResult =
	| { decision: DeliveryGateDecision & { ok: true }; attempt: VerifiedDeliveryAttempt }
	| { decision: DeliveryGateDecision & { ok: false } };

export type PrePushObservations = { selectedPushHead: StringObservation; selectedPushTree: StringObservation };

export type PrePrObservations = {
	localHead: StringObservation;
	effectiveRemoteHead: StringObservation;
	// `undefined` means no PR exists yet; `null` means it exists but its head
	// could not be resolved, which blocks the mutation.
	existingPrHead: () => string | null | undefined;
};

type HeadCheck = readonly [() => string | null | undefined, expected: string, unresolved: string, divergent: string, optional?: boolean];

// Comparador común de identidades. Distingue tres desenlaces a propósito:
// no resoluble, divergente y ausente-pero-opcional. Confundir "no se pudo leer"
// con "coincide" sería aprobar por no saber.
function requireMatchingHeads(boundary: DeliveryGateBoundary, checks: readonly HeadCheck[]): DeliveryGateDecision | null {
	for (const [observe, expected, unresolved, divergent, optional] of checks) {
		const observed = observe();
		if (optional && observed === undefined) continue;
		if (!observed) return failDeliveryGate(boundary, unresolved);
		if (observed !== expected) return failDeliveryGate(boundary, divergent);
	}
	return null;
}

// PRE-COMMIT. Exige tres cosas a la vez: que la base no se haya movido, que el
// candidato reconstruido siga siendo el del recibo, y que el árbol REAL del
// índice sea ese mismo. Las tres son necesarias — un índice correcto sobre una
// base distinta produce un commit distinto.
export function validatePreCommitReceiptGate(
	cwd: string,
	change: string,
	observations: PreCommitObservations,
	expectedFingerprint?: string,
): ReceiptGateResult {
	const fresh = validateFreshCandidateReceipt(cwd, change, expectedFingerprint);
	if (!fresh.ok) return { decision: failDeliveryGate("pre-commit", fresh.reason) };
	const failure = requireMatchingHeads("pre-commit", [
		[observations.baseHead, fresh.receipt.head, "no se pudo resolver el HEAD base actual", "el HEAD base actual difiere del recibo"],
		[observations.candidateTree, fresh.receipt.treeSha, "no se pudo reconstruir el árbol candidato", "el árbol candidato actual difiere del recibo"],
		[observations.indexTree, fresh.receipt.treeSha, "no se pudo resolver el árbol real del índice", "el árbol real del índice difiere del recibo"],
	]);
	if (failure) return { decision: failure };
	return {
		decision: passDeliveryGate("pre-commit"),
		attempt: { receiptFingerprint: fresh.fingerprint },
	};
}

export function validatePostCommitReceiptGate(
	cwd: string,
	change: string,
	attempt: VerifiedDeliveryAttempt | undefined,
	observations: PostCommitObservations,
): ReceiptGateResult {
	if (!attempt?.receiptFingerprint) {
		return { decision: failDeliveryGate("post-commit", "no hay un recibo validado para este intento de entrega") };
	}
	const fresh = validateFreshCandidateReceipt(cwd, change, attempt.receiptFingerprint);
	if (!fresh.ok) return { decision: failDeliveryGate("post-commit", fresh.reason) };
	const head = observations.head();
	if (!head) return { decision: failDeliveryGate("post-commit", "no se pudo resolver HEAD tras los hooks") };
	const headTree = observations.headTree();
	if (!headTree) return { decision: failDeliveryGate("post-commit", "no se pudo resolver HEAD^{tree} tras los hooks") };
	if (headTree !== fresh.receipt.treeSha) {
		return { decision: failDeliveryGate("post-commit", "HEAD^{tree} difiere del árbol del recibo") };
	}
	return {
		decision: passDeliveryGate("post-commit"),
		attempt: { receiptFingerprint: fresh.fingerprint, validatedDeliveryHead: head },
	};
}

// PRE-PUSH. La fuente de un push es un SHA, no un nombre de rama: un nombre se
// resuelve en el momento del push y puede apuntar a otra cosa. Se relee aquí
// porque un post-commit limpio no autoriza una rama que se movió después.
export function validatePrePushReceiptGate(
	cwd: string,
	change: string,
	attempt: VerifiedDeliveryAttempt | undefined,
	observations: PrePushObservations,
): ReceiptGateResult {
	if (!attempt?.receiptFingerprint || !attempt.validatedDeliveryHead) {
		return { decision: failDeliveryGate("pre-push", "no hay un HEAD de entrega validado para este intento") };
	}
	const fresh = validateFreshCandidateReceipt(cwd, change, attempt.receiptFingerprint);
	if (!fresh.ok) return { decision: failDeliveryGate("pre-push", fresh.reason) };
	const failure = requireMatchingHeads("pre-push", [
		[observations.selectedPushHead, attempt.validatedDeliveryHead, "no se pudo resolver el SHA fuente del push", "el SHA fuente del push difiere del HEAD de entrega validado"],
		[observations.selectedPushTree, fresh.receipt.treeSha, "no se pudo resolver el árbol de la fuente del push", "el árbol de la fuente del push difiere del recibo"],
	]);
	if (failure) return { decision: failure };
	return { decision: passDeliveryGate("pre-push"), attempt };
}

// PRE-PR. `undefined` significa "todavía no hay PR" y es el único caso no
// aplicable; `null` significa "hay PR pero su cabeza no se pudo resolver", y eso
// bloquea — no saber no es una aprobación. Toda cabeza aplicable debe resolver
// AHORA y coincidir con el SHA del post-commit.
export function validatePrePrReceiptGate(
	cwd: string,
	change: string,
	attempt: VerifiedDeliveryAttempt | undefined,
	observations: PrePrObservations,
): ReceiptGateResult {
	if (!attempt?.receiptFingerprint || !attempt.validatedDeliveryHead) {
		return { decision: failDeliveryGate("pre-pr", "no hay un HEAD de entrega validado para este intento") };
	}
	const fresh = validateFreshCandidateReceipt(cwd, change, attempt.receiptFingerprint);
	if (!fresh.ok) return { decision: failDeliveryGate("pre-pr", fresh.reason) };
	const failure = requireMatchingHeads("pre-pr", [
		[observations.localHead, attempt.validatedDeliveryHead, "no se pudo resolver el HEAD local explícito del PR", "el HEAD local explícito del PR difiere del HEAD de entrega validado"],
		[observations.effectiveRemoteHead, attempt.validatedDeliveryHead, "no se pudo resolver el HEAD remoto efectivo del PR", "el HEAD remoto efectivo del PR difiere del HEAD de entrega validado"],
		[observations.existingPrHead, attempt.validatedDeliveryHead, "no se pudo resolver el HEAD del PR existente", "el HEAD del PR existente difiere del HEAD de entrega validado", true],
	]);
	if (failure) return { decision: failure };
	return { decision: passDeliveryGate("pre-pr"), attempt };
}
