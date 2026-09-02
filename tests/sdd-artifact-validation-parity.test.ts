import { describe, expect, test } from "bun:test";

import * as pi from "../ein-pi/agent/lib/sdd-guardrails.ts";
import * as shared from "../shared/sdd/sdd-artifact-validation.ts";

describe("paridad de validación de artefactos SDD", () => {
	test("diseño, tareas y fases producen los mismos informes", () => {
		const design = "# Design\n\n## A. Proposal\n\nAlgo\n\n## B. Spec\n\nOtra cosa\n";
		const tasks = "# Tasks\n\nstatus: ready\nblocked_by: none\n\n## Grupo\n\n- [ ] Hacer algo\n- verify: `bun test`\n";
		expect(shared.lintDesignArtifact(design)).toEqual(pi.lintDesignArtifact(design));
		expect(shared.lintTasksArtifact(tasks)).toEqual(pi.lintTasksArtifact(tasks));
		expect(shared.lintPhaseArtifact("verify", "status: pass\n")).toEqual(pi.lintPhaseArtifact("verify", "status: pass\n"));
	});

	test("avisos y errores conservan código, orden y texto", () => {
		const malformed = "# Tasks\n\n## Grupo\n\n`<number>`\n";
		expect(shared.lintTasksArtifact(malformed)).toEqual(pi.lintTasksArtifact(malformed));
		expect(shared.oversizedGroupWarnings(malformed)).toEqual(pi.oversizedGroupWarnings(malformed));
	});
});
