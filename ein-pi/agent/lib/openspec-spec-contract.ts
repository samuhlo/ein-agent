import { createHash } from "node:crypto";

export const OPEN_SPEC_FORMAT = "openspec-spec/v1";
export const DOMAIN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface OpenSpecScenario {
	id: string;
	title: string;
	requirement: string;
	given: string;
	when: string;
	then: string;
}

export interface OpenSpecDocument {
	domain: string;
	scenarios: readonly OpenSpecScenario[];
}

export interface DigestManifestEntry {
	path: string;
	bytes: Uint8Array;
}

export function scenarioIdentity(domain: string, scenarioId: string): string {
	return `${domain}/${scenarioId}`;
}

export function serializeOpenSpec(spec: OpenSpecDocument): string {
	const scenarios = [...spec.scenarios].sort((left, right) => left.id.localeCompare(right.id, "en"));
	const lines = [
		"# OpenSpec Specification",
		`format: ${OPEN_SPEC_FORMAT}`,
		`domain: ${spec.domain}`,
	];

	for (const scenario of scenarios) {
		lines.push(
			"",
			`## Scenario: ${scenario.id}`,
			`title: ${scenario.title}`,
			`requirement: ${scenario.requirement}`,
			`Given: ${scenario.given}`,
			`When: ${scenario.when}`,
			`Then: ${scenario.then}`,
		);
	}

	return `${lines.join("\n")}\n`;
}

export function sha256(bytes: Uint8Array | string): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function digestManifest(entries: readonly DigestManifestEntry[]): string {
	const manifest = [...entries]
		.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
		.map(({ path, bytes }) => {
			const pathBytes = Buffer.from(path, "utf8");
			return Buffer.concat([
				Buffer.from(`${pathBytes.length}:`, "ascii"),
				pathBytes,
				Buffer.from(`${bytes.length}:`, "ascii"),
				Buffer.from(bytes),
			]);
		});

	return sha256(Buffer.concat(manifest));
}
