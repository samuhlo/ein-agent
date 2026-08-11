import solidPlugin from "@opentui/solid/bun-plugin";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "./shared";

await mkdir(join(ROOT, "dist"), { recursive: true });
const result = await Bun.build({
  entrypoints: [join(ROOT, "src", "dashboard-candidate.tsx")],
  target: "bun",
  plugins: [solidPlugin],
  compile: { outfile: join(ROOT, "dist", "ein-opentui-dashboard-candidate") },
});
if (!result.success) throw new AggregateError(result.logs, "Dashboard candidate build failed");
