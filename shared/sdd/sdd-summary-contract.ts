// The linter and archive transaction share mechanical requirements. Headings
// and command quoting are presentation choices, not routing facts.
export function summaryContractErrors(text: string, change?: string): string[] {
	const header = text.replaceAll("\r\n", "\n").replace(/^# [^\n]*\n/, "").split(/^#{1,6} /m)[0] ?? "";
	const fields = new Map(header.split("\n").flatMap((line) => {
		const match = /^([a-z_]+):\s*(.*?)\s*$/.exec(line);
		return match ? [[match[1]!, match[2]!] as const] : [];
	}));
	const errors: string[] = [];
	if (fields.get("status") !== "complete") errors.push("status: complete");
	if (!fields.get("change") || change !== undefined && fields.get("change") !== change) errors.push(`change: ${change ?? "<nombre del cambio>"}`);
	const groups = Number(fields.get("work_groups"));
	if (!Number.isInteger(groups) || groups < 1) errors.push("work_groups: <entero positivo>");
	if (fields.get("verification_status") !== "pass") errors.push("verification_status: pass");
	if (!/^\s*-\s*verify\s*:\s*(?:`[^`\n]+`|[^`\s][^\n]*)\s*$/im.test(text)) errors.push("- verify: <comando ejecutado>");
	return errors;
}
