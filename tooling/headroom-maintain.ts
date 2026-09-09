/** Thin CLI over the same maintenance gate used by /ein:headroom. */
import { maintainHeadroom } from "../ein-pi/agent/lib/headroom-maintenance.ts";
export { selectHeadroomVersion } from "../ein-pi/agent/lib/headroom-maintenance.ts";
if (import.meta.main) {
  const command = process.argv[2];
  if (command !== "update" && command !== "rollback") throw new Error("Usage: headroom-maintain.ts update VERSION | rollback");
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try { console.log(await maintainHeadroom(command, process.argv[3], process.env, controller.signal)); }
  finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
}
