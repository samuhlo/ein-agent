import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { artifactPath, relativeArtifactPath, sha256, type CellInventory } from "../src/package-layout";
import { currentTarget, SURFACES, TARGETS } from "../src/targets";
import { collectMetrics } from "./metrics";
import { smokeSurface, type SmokeResult } from "./smoke";
import { ROOT } from "./shared";

type CellResult = {
  surface: string;
  target: string;
  build: "pass";
  inventory: "pass";
  runtime: "pass" | "not-run";
  note: string;
};

const current = currentTarget();
const smokeResults: SmokeResult[] = [];
for (const surface of SURFACES) smokeResults.push(await smokeSurface(surface));
if (smokeResults.some(({ status }) => status !== "pass")) throw new Error("Current-host PTY smoke failed");

const cells: CellResult[] = [];
for (const surface of SURFACES) {
  for (const target of TARGETS) {
    const inventoryPath = join(ROOT, "evidence", "inventories", `${surface}-${target.id}.json`);
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as CellInventory;
    const staged = join(ROOT, "staged", surface, target.id, relativeArtifactPath(surface));
    const bytes = await readFile(staged);
    const mode = (await stat(staged)).mode & 0o777;
    if (inventory.artifact.sha256 !== sha256(bytes) || mode !== 0o755) {
      throw new Error(`Inventory verification failed for ${surface}/${target.id}`);
    }
    if ((await stat(artifactPath(ROOT, target))).size !== inventory.artifact.bytes) {
      throw new Error(`Build size mismatch for ${surface}/${target.id}`);
    }
    const runtime = target.id === current.id ? "pass" : "not-run";
    cells.push({
      surface,
      target: target.id,
      build: "pass",
      inventory: "pass",
      runtime,
      note: runtime === "pass" ? "Executed natively from the staged surface in a real PTY" : "Cross-built and inspected; native workflow execution required",
    });
  }
}

const metrics = await collectMetrics(smokeResults);
const result = {
  format: "ein-opentui-solid-wp0/v1",
  status: "partial",
  statusDefinitions: {
    pass: "Executed and met the stated check",
    partial: "Some required native cells remain unexecuted",
    blocked: "Execution was attempted but could not establish the requirement",
    "not-run": "No native execution was attempted for this cell",
  },
  executiveSummary: "All four glibc/macOS standalone targets cross-built and all eight spike-only package cells passed inventory checks. Only the two current-host surface cells ran natively; remaining runtime cells are not-run pending the isolated native workflow.",
  packageResolution: {
    direct: { "@opentui/core": "0.5.1", "@opentui/solid": "0.5.1", "solid-js": "1.9.12" },
    install: "bun install --frozen-lockfile --os=\"*\" --cpu=\"*\"",
    linuxLibc: "glibc explicitly compiled via process.env.OPENTUI_LIBC definition",
    musl: "not in EIN's approved four-target matrix",
    runtimeDownloadObservedCurrentHost: false,
    runtimeZigRequiredCurrentHost: false,
  },
  buildMatrix: TARGETS.map((target) => ({
    target: target.id,
    bunTarget: target.bunTarget,
    nativePackage: `${target.nativePackage}@0.5.1`,
    libc: target.libc,
    status: "pass",
  })),
  surfaceMatrix: cells,
  runtimeEvidence: smokeResults,
  metrics,
  verification: {
    focusedCheck: "pass",
    fourTargetBuild: "pass",
    eightCellInventory: "pass",
    currentHostPty: "pass",
    productionAssetsChanged: false,
  },
  blockers: ["Six non-host surface/target runtime cells require native GitHub-hosted runner execution; cross-build inspection is not runtime acceptance."],
  nextRecommended: "Run the isolated opentui-solid-packaging-spike workflow and merge its four native evidence fragments before evaluating the 8/8 WP0 gate.",
};
await Bun.write(join(ROOT, "evidence", "wp0-result.json"), `${JSON.stringify(result, null, 2)}\n`);

const evidence = `# Work Package 0 Evidence\n\nStatus: **partial**\n\nAll four standalone artifacts build and all eight spike-only Pi/Claude inventories verify. Native runtime acceptance is limited to ${current.id} on this host; the other six cells remain \`not-run\`.\n\n## Commands\n\n\`bun install --frozen-lockfile --os="*" --cpu="*"\`  \n\`bun run check\`  \n\`bun run build\`  \n\`bun run inventory\`  \n\`bun run verify\`\n\n## Proven Facts\n\n- Direct packages are exactly \`@opentui/core@0.5.1\`, \`@opentui/solid@0.5.1\`, and \`solid-js@1.9.12\`.\n- Linux artifacts compile for glibc with \`process.env.OPENTUI_LIBC\` defined as \`glibc\`; musl is not silently selected.\n- The ${current.id} Pi and Claude staged executables ran in a real PTY with an isolated home, no Bun on \`PATH\`, blocked HTTP proxies, and no Zig requirement.\n- The Solid marker, 47x13 resize event, renderer destruction, exit 0, executable mode, and SHA-256 were observed.\n- The package-closure comparison is measured but remains partial because it requires an external Bun runtime and staged package resolution.\n\n## Acceptance Boundary\n\nCross-compilation and inventory inspection are not native acceptance. See \`wp0-result.json\` for cell-level statuses, raw samples, sizes, and startup measurements. The dedicated workflow is manual/path-triggered, bounded, uploads evidence, and never publishes.\n`;
await Bun.write(join(ROOT, "evidence", "README.md"), evidence);
console.log(JSON.stringify(result, null, 2));
