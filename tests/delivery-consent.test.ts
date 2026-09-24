import { expect, test } from "bun:test";
import { bindDeliveryWork, nextDeliveryIntent, deliveryIntentActive, DELIVERY_INTENT_TTL_MS, messageRequestsDelivery } from "../ein-pi/agent/lib/git-delivery.ts";
import { taskRequestsGuardedDelivery } from "../ein-pi/agent/lib/guardrails.ts";
import { deliveryPreview } from "../ein-pi/agent/lib/delivery-preview.ts";
import { confirmDelegatedDelivery } from "../ein-pi/agent/lib/guardrails.ts";

test("the reported apply verification clause never opens delivery consent", async () => {
  const task = "Verifica: env -u DATABASE_URL -u APP_ENV -u DATABASE_ENV bunx vitest run tests/api/cursos-capa-autoral.test.ts; env -u DATABASE_URL -u APP_ENV -u DATABASE_ENV bun run typecheck; git diff --check. No build/suite completa todavía, DB/Neon/migraciones/esquema/dependencias, commit/push. Preservar todo trabajo previo y cambios locales ajenos.";
  for (const text of [task, "Sin DB, commit/push/PR.", "No dependencias, commit / push.", "Without database changes, commit/push.", "No DB, run/build, commit/push/PR."]) {
    expect(taskRequestsGuardedDelivery(text), text).toBe(false);
    let asked = false;
    const result = await confirmDelegatedDelivery({ agent: "sdd-apply", task: text }, { cwd: "/tmp/unused", hasUI: true } as never, { mode: "ask", userRequested: false, confirm: async () => { asked = true; return true; } });
    expect(result).toBeUndefined(); expect(asked).toBe(false);
  }
  for (const text of ["No DB, pero haz push de la rama.", "Sin migraciones; commit and push the branch.", "Without database changes, push the branch to origin.", "No cambies tests, commit and push.", "No DB, git commit -m fix && git push."]) expect(taskRequestsGuardedDelivery(text), text).toBe(true);
});

test("the alpha migration prohibition is not a request to push", () => {
  const task = "intent_work: alpha-v1-01-centros-asignaciones-migracion\nImplementa SOLO //003 / tarea3.1. Ejecuta bun run db:generate LOCAL.\nNo db:push/migrate/seed ni CLI BetterAuth.\nSin nuevas dependencias, secretos, config, branches/commit/push/PR/merge; preservar todos cambios ajenos.";
  expect(taskRequestsGuardedDelivery(task)).toBe(false);
  expect(messageRequestsDelivery("Sin nuevas dependencias, secretos, config, branches/commit/push/PR/merge")).toBe(false);
  for (const text of [
    "Sin dependencias, secretos, config, branches/commit/push/PR/merge; haz push de la rama.",
    "No cambies tests y haz push de la rama.",
    "Sin push, pero abre PR.",
    "Without commits/push/PR, but open a pull request.",
  ]) expect(taskRequestsGuardedDelivery(text)).toBe(true);
  for (const text of [
    "Sin nuevas dependencias, commits, push ni PR.",
    "Do not change dependencies, branches/commit/push/PR/merge.",
    "Sin hacer commit ni push ni abrir PR.",
    "Prepara la migración; no subas la rama ni hagas push.",
  ]) expect(taskRequestsGuardedDelivery(text)).toBe(false);
});
test("authorization binds to one work item before long planning and can be revoked", () => {
  const now = 1000;
  const original = nextDeliveryIntent(undefined, "monta las PRs", now);
  const bound = bindDeliveryWork(original, "alpha-01", now + 100);
  const later = now + DELIVERY_INTENT_TTL_MS * 4;
  expect(deliveryIntentActive(bound, later, "alpha-01")).toBe(true);
  expect(deliveryIntentActive(bound, later, "alpha-02")).toBe(false);
  expect(deliveryIntentActive(bound, later)).toBe(false);
  expect(bindDeliveryWork(bound, "alpha-02", later)).toEqual(bound);
  const neutral = nextDeliveryIntent(bound, "continúa", later);
  expect(deliveryIntentActive(neutral, later, "alpha-01")).toBe(true);
  const revoked = nextDeliveryIntent(bound, "no hagas push", later);
  expect(deliveryIntentActive(revoked, later, "alpha-01")).toBe(false);
  expect(bindDeliveryWork(original, "alpha-01", later)?.work).toBeUndefined();
});
test("delivery confirmation puts operation and reason before internal task context", () => {
  const task = "intent_work: example\n" + "Detalles de implementación irrelevantes. ".repeat(20) + "\nSube la rama fix/example a origin y abre PR hacia dev.";
  const preview = deliveryPreview([task], "/nonexistent/ein-consent-fixture", "ask");
  expect(preview.title).toContain("entrega");
  expect(preview.summary?.[0]).toBe("Subir la rama y abrir una PR");
  expect(preview.summary).toContain("Base de PR pedida  dev");
  expect(preview.body).toContain("origin");
  expect(preview.body).toContain("hacia dev");
  expect(preview.body).toContain("preguntar siempre");
  expect(preview.body).not.toContain("intent_work:");
  expect(preview.body).not.toContain("Detalles de implementación");
  expect(deliveryPreview(["Abre PR hacia dev"], "/nonexistent", "auto").summary?.[0]).toBe("Abrir una PR");
  expect(deliveryPreview(["Crea un commit local"], "/nonexistent", "ask").summary?.[0]).toBe("Crear un commit");
});
