// INCIDENT -> Preserve the failed citation and dependency graph without private project content.
export function disjointScoutReport() {
	const references = Array.from({ length: 12 }, (_, index) => ({
		id: `R${index + 1}`, path: "source.ts", lines: index === 5 ? "49-83,91-117" : "1-3", supports: `Evidence ${index + 1}`,
	}));
	return {
		version: "ein-scout-report/v1", summary: "Plan and export entrypoints inspected", summaryReferenceIds: ["R1", "R2", "R3", "R4"],
		findings: references.filter(({ id }) => id !== "R8").map(({ id }) => ({ claim: `Observation supported by ${id}`, referenceIds: id === "R7" ? ["R7", "R8"] : [id] })),
		references, uncertainties: [{ level: "none", statement: "No gap in the controlled fixture" }],
	};
}

export function malformedFindingScoutReport(): string {
	const report = disjointScoutReport();
	report.references[5]!.lines = "49-83";
	return JSON.stringify(report).replace(
		'{"claim":"Observation supported by R7","referenceIds":["R7","R8"]}',
		'{"claim":"Observation supported by R7.[R7","R8"]}',
	);
}
