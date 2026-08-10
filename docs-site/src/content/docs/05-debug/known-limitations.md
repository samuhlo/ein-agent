---
title: "Limitaciones conocidas"
description: "Qué está probado de verdad, qué no, y qué puede cambiar."
sources: ["docs/roadmap-beta.md", "docs/roadmap-features-ein.md"]
verified_rev: "eeceb7c"
---

Página obligatoria de la beta. Sin suavizar.

:::caution[BETA]
EIN está en beta. Eso no es una etiqueta de marketing: significa que hay cosas
probadas, cosas probadas a medias y cosas que van a cambiar.
:::

## Plataformas

| | Estado |
| :--- | :--- |
| Linux | probado |
| macOS | soportado, con menos ejercicio real que Linux |
| Windows | **no soportado** |

## Runtimes

Los dos —Pi Coding Agent y Claude Code— están soportados y se instalan aislados.
Lo que **no** está demostrado:

**El MCP externo de Claude Code no se ha ejercitado contra servicios en vivo.**
La evidencia archivada de la paridad entre runtimes lo registra explícitamente.
Las integraciones opcionales se configuran; que funcionen contra servicios
reales no está comprobado.

**La traducción de herramientas Pi → Claude es best-effort.** El sincronizador
sustituye un conjunto acotado de referencias. Una herramienta específica de Pi
que no conozca llega literal a Claude Code, donde no existe, y **no falla
ruidosamente**.

**El enrutado de modelos está escrito a mano.** Coincide con los agentes
actuales por mantenimiento, no por mecanismo. Un agente nuevo no obtiene
enrutado automático ni aviso.

## Lo que el gate de shell no cubre

El hook de Claude Code intercepta **comandos de shell**. Eso significa que:

- Gatea git, y bien: el force-push está denegado siempre.
- **No** fuerza que la escritura de ficheros pase por los subagentes.
- **No** intercepta las ediciones directas de ficheros.

Entrar en el flujo SDD depende del coordinador, no del hook.

## Verificación: qué significa y qué no

Un cambio con `verify: pass` significa que **los criterios que su propio diseño
declaró se cumplieron**. No significa que el código sea correcto, ni que los
criterios fueran los adecuados.

Cuando un proyecto no tiene runner de tests, la fase lo declara y usa
comprobaciones mecánicas en su lugar. Es honesto, y es menos garantía que un
ciclo de tests real.

## Flujos que aún no están maduros

**El launcher.** Hay trabajo mergeado en esa dirección —estado compartido de
proyecto, adaptadores de sesión, un workbench mínimo— pero el camino completo
sigue la secuencia declarada en el roadmap y no está terminado. El registro
mantenido de qué está hecho y con qué evidencia vive en
[`docs/roadmap-beta.md`](https://github.com/samuhlo/ein-agent/blob/main/docs/roadmap-beta.md).

**El updater universal.** `ein-install update` actualiza EIN. No es un actualizador
genérico de cualquier runtime y no debe presentarse como tal.

**Paralelismo con worktrees.** No hay garantías sobre escritores paralelos ni
sobre worktrees compartidos.

## Fuera del compromiso de beta

Descartado **para la beta** de forma explícita, y por tanto no es criterio
implícito de aceptación:

- Dashboard o TUI de navegación general.
- Convertir el instalador en launcher.
- Migrar historiales privados de conversación entre runtimes: las sesiones
  siguen siendo privadas de cada runtime.
- Procesos automáticos de limpieza o arquitectura.

## Qué puede cambiar

En beta, y con impacto en quien ya lo use:

- La forma de los artefactos SDD.
- Los comandos del CLI y sus flags.
- Las rutas de instalación.
- Qué integraciones vienen por defecto.

Los cambios con impacto van al
[CHANGELOG](https://github.com/samuhlo/ein-agent/blob/main/CHANGELOG.md).

## La fuente de verdad

Esta página resume. El registro mantenido, con su evidencia y sus criterios de
salida, es
[`docs/roadmap-beta.md`](https://github.com/samuhlo/ein-agent/blob/main/docs/roadmap-beta.md).

Si algo de aquí y de allí no coincide, manda el roadmap.

## Siguiente

[Uninstall & Recovery](/ein-agent/05-debug/uninstall-recovery/) — volver atrás
sin perder nada.
