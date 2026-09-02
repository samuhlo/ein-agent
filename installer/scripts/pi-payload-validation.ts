import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

export type SharedOverlayGroup = Readonly<{
  root: string;
  namespace: "contracts" | "sdd";
  files: readonly string[];
}>;

export function assertSharedOverlayFacades(
  agentLibRoot: string,
  groups: readonly SharedOverlayGroup[],
): void {
  for (const group of groups) {
    for (const file of group.files) {
      const path = join(agentLibRoot, file);
      if (!existsSync(path) || !statSync(path).isFile()) {
        throw new Error(`Falta la fachada Pi del módulo compartido: ${file}`);
      }
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      const statement = source.statements[0];
      const expected = `../../../shared/${group.namespace}/${file}`;
      const pure = source.statements.length === 1
        && statement !== undefined
        && ts.isExportDeclaration(statement)
        && !statement.isTypeOnly
        && statement.exportClause === undefined
        && statement.moduleSpecifier !== undefined
        && ts.isStringLiteral(statement.moduleSpecifier)
        && statement.moduleSpecifier.text === expected
        && statement.attributes === undefined;
      if (!pure) {
        throw new Error(`La fachada Pi debe ser un único re-export puro: ${file} -> ${expected}`);
      }
    }
  }
}

function typescriptSourcesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return typescriptSourcesUnder(path);
    return entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) ? [path] : [];
  });
}

function isInside(root: string, candidate: string): boolean {
  const boundary = relative(root, candidate);
  return boundary === "" || (!isAbsolute(boundary) && boundary !== ".." && !boundary.startsWith(`..${sep}`));
}

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function resolveRelativeModule(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier);
  for (const extension of ["", ".ts", ".tsx", ".js", ".json"]) {
    const candidate = `${base}${extension}`;
    if (isRegularFile(candidate)) return candidate;
  }
  for (const extension of ["", ".ts", ".tsx", ".js", ".json"]) {
    const candidate = join(base, `index${extension}`);
    if (isRegularFile(candidate)) return candidate;
  }
  return null;
}

export function assertRelativeTypeScriptModuleClosure(payloadRoot: string): void {
  const root = resolve(payloadRoot);
  const issues: string[] = [];
  for (const path of typescriptSourcesUnder(root)) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const check = (node: ts.StringLiteralLike | undefined): void => {
      if (!node || !node.text.startsWith(".")) return;
      const base = resolve(dirname(path), node.text);
      const location = `${relative(root, path)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
      if (!isInside(root, base)) {
        issues.push(`${location} escapa del payload: ${node.text}`);
        return;
      }
      const resolved = resolveRelativeModule(path, node.text);
      if (!resolved || !isInside(root, resolved)) issues.push(`${location} no resuelve: ${node.text}`);
    };
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        check(node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier : undefined);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        check(expression && ts.isStringLiteralLike(expression) ? expression : undefined);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        check(ts.isStringLiteralLike(node.argument.literal) ? node.argument.literal : undefined);
      } else if (ts.isCallExpression(node)) {
        const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
        if (isImport || isRequire) {
          const argument = node.arguments[0];
          check(argument && ts.isStringLiteralLike(argument) ? argument : undefined);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  if (issues.length > 0) {
    throw new Error(`El grafo TypeScript del payload Pi no está cerrado:\n${issues.sort().join("\n")}`);
  }
}

export async function assertEntrypointsCompile(entrypoints: readonly string[]): Promise<void> {
  let result: Awaited<ReturnType<typeof Bun.build>>;
  try {
    result = await Bun.build({
      entrypoints: [...entrypoints],
      target: "bun",
      packages: "external",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Los entrypoints Pi no compilan desde el payload instalado: ${detail}`);
  }
  if (!result.success) {
    const detail = result.logs.map((log) => log.message).filter(Boolean).join("; ");
    throw new Error(`Los entrypoints Pi no compilan desde el payload instalado${detail ? `: ${detail}` : ""}`);
  }
}

export async function assertPiPayloadIsLinked(staging: string): Promise<void> {
  assertRelativeTypeScriptModuleClosure(staging);
  const extensions = readdirSync(join(staging, "extensions"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(staging, "extensions", entry.name));
  await assertEntrypointsCompile([
    join(staging, "app.ts"),
    ...extensions,
    join(staging, "surfaces", "surface-runner.ts"),
  ]);
}
