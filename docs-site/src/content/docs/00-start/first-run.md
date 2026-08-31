---
title: "First Run"
description: "Un cambio pequeño de principio a fin: qué pides, qué hace EIN y qué te deja para revisar."
sources: ["runtime/docs/GUIA_PI_WORKFLOW.md", "runtime/docs/SDD_ARTIFACT_GRAMMAR.md", "openspec/specs/sdd-lifecycle/spec.md"]
verified_rev: "29861f5"
---

Ya tienes EIN instalado. Esto es cómo se siente usarlo en un cambio real y
pequeño, sin demo de escaparate.

## La petición

Abres `ein`, eliges Pi o Claude Code y pides algo en lenguaje normal. Si ya
sabes a qué runtime quieres entrar, `ein-pi` y `ein-cc` son los accesos directos
avanzados:

```text
El validador de emails acepta direcciones sin dominio. Arréglalo.
```

## Lo primero que pasa: no empieza a escribir código

EIN no salta a editar ficheros. Arranca la cadena SDD y la primera fase acota el
problema: qué entra, qué no, y con qué presupuesto de lectura se trabaja.

En cuanto hay un cambio activo, puedes preguntar dónde está en cualquier momento:

```bash
ein-cc-sdd status
```

```text
change: fix-email-validation
current phase: map
next: map
artifacts present: scope(scope.md)
artifacts missing: map(map.md), design(design.md), tasks(tasks.md), ...
```

Ese estado **no lo dice el modelo**: lo calcula una herramienta leyendo el disco.
Si el agente afirmara que va por `apply` y los artefactos dijeran otra cosa,
gana el disco.

## Lo que se va acumulando

Cada fase deja su artefacto en `openspec/changes/fix-email-validation/`:

```text
scope.md            qué entra y qué no
map.md              dónde vive el código y qué lo toca
design.md           la decisión, sus alternativas y los criterios de éxito
tasks.md            el checklist ejecutable
apply-progress.md   lo que se hizo, con la salida real de los tests
verify-report.md    qué se comprobó y qué no
summary.md          el resumen del cierre
```

No son notas: son el contrato entre fases. `design.md` fija los criterios de
aceptación, y `verify-report.md` los responde uno a uno.

## En apply, los tests van primero

Si el proyecto tiene runner de tests configurado, la fase de implementación
trabaja en ciclos: escribe el test, comprueba que **falla por la razón concreta
que debe fallar**, implementa, y comprueba que pasa. La salida real de cada
ejecución queda registrada.

```text
✗ rechaza direcciones sin dominio     (fail)
  → implementación
✓ rechaza direcciones sin dominio     (pass)
```

Cuando no hay runner —por ejemplo en un cambio que solo toca documentación— el
flujo lo declara y usa comprobaciones mecánicas en su lugar, en vez de fingir un
ciclo que no existe.

## Qué tienes que revisar tú

Tres cosas, y en este orden:

1. **`design.md`** — la decisión. Es donde se elige el enfoque; si el enfoque
   está mal, el resto del trabajo está mal aunque los tests pasen.
2. **El diff** — más pequeño que el habitual porque el alcance se acotó antes.
3. **`verify-report.md`** — y sobre todo lo que dice que **no** comprobó. Esa
   sección vale más que la lista de lo que sí.

## Cuando algo se bloquea

Pasa, y es el comportamiento correcto. Una fase que no puede continuar devuelve
`status: blocked` con la causa concreta en lugar de improvisar:

```text
■ blockers:
- estado de specs OpenSpec: unresolved; map bloqueado hasta resolver
  la procedencia desde scope.
```

Prefiere pararse a inventarse el camino. Cuando veas un bloqueo, la causa está
en el mensaje y la decisión es tuya.

## Al cerrar

El cambio se archiva en `openspec/changes/archive/` como un único `summary.md`.
Ese resumen conserva qué se hizo, cómo funciona, las decisiones, la
verificación y los riesgos. Los demás artefactos eran la mesa de trabajo y se
eliminan al cerrar.

## Siguiente

[Orchestrator](/ein-agent/01-concepts/orchestrator/) — quién decide qué en todo
esto.
