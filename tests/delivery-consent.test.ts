import { expect, test } from "bun:test";
import { bindDeliveryWork, nextDeliveryIntent, deliveryIntentActive, DELIVERY_INTENT_TTL_MS, messageRequestsDelivery } from "../ein-pi/agent/lib/git-delivery.ts";
import { taskRequestsGuardedDelivery } from "../ein-pi/agent/lib/guardrails.ts";
import { deliveryPreview } from "../ein-pi/agent/lib/delivery-preview.ts";

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
  expect(preview.body).toContain("Acción:");
  expect(preview.body).toContain("origin");
  expect(preview.body).toContain("hacia dev");
  expect(preview.body).toContain("preguntar siempre");
  expect(preview.body).not.toContain("intent_work:");
  expect(preview.body).not.toContain("Detalles de implementación");
  expect(deliveryPreview(["Abre PR hacia dev"], "/nonexistent", "auto").title).not.toContain("push");
});
