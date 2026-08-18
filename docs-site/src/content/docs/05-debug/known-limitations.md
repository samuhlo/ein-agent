---
title: "Limitaciones conocidas"
description: "Qué está probado de verdad, qué no, y qué puede cambiar."
sources: ["docs/roadmap-features-ein.md"]
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

Un cambio con `verify: pass` significa que **los criterios declarados por el
cambio y su carril se cumplieron**. Prueba ese contrato local, no una garantía
universal de que el código sea correcto ni de que los criterios fueran los
adecuados.

Cuando un proyecto no tiene runner de tests, la fase lo declara y usa
comprobaciones mecánicas en su lugar. Es honesto, y es menos garantía que un
ciclo de tests real.

Codegraph ofrece un bootstrap asistido opcional cuando falta su índice. Su modo
`on` por defecto no lo convierte en una dependencia obligatoria. Engram también
es opcional y, cuando está habilitado, conserva el contexto compartido por
cambio en vez de convertirse en memoria universal.

El puente entre Pi y Claude es el proyecto y su checkpoint en disco. Los
historiales privados de cada runtime siguen siendo privados y no se transfieren
entre sesiones.

## Traducción fail-closed

La traducción conserva un estado visible para cada directiva. Solo `applied`
representa una directiva inyectada en el runtime; los demás estados no
representan aplicación exitosa ni un valor predeterminado:

| Estado | Significado |
| :--- | :--- |
| `unreadable` | La fuente no se puede leer. |
| `unsupported` | El runtime no admite la directiva. |
| `inactive` | La capacidad o configuración no está activa. |
| `unhandled` | No existe un traductor o manejador para la directiva. |
| `applied` | La directiva se inyecta en el runtime. |

Los estados `unreadable`, `unsupported`, `inactive` y `unhandled` permanecen
visibles para diagnóstico. El comportamiento fail-closed no los convierte en
defaults ni oculta la ausencia de aplicación.

La participación automática de Cleaner y Architect está disponible únicamente
en Pi. Claude los marca como no aplicable o no soportado; la ausencia de esa
participación no se presenta como ejecución del perfil.

## Flujos que aún no están maduros

**El launcher.** Hay trabajo mergeado en esa dirección —estado compartido de
proyecto, adaptadores de sesión, un workbench mínimo— pero el camino completo
sigue la secuencia declarada en el roadmap y no está terminado. El registro
mantenido de qué está hecho y con qué evidencia vive en
[`docs/roadmap-features-ein.md`](https://github.com/samuhlo/ein-agent/blob/main/docs/roadmap-features-ein.md).

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
[`docs/roadmap-features-ein.md`](https://github.com/samuhlo/ein-agent/blob/main/docs/roadmap-features-ein.md).

Si algo de aquí y de allí no coincide, manda el roadmap.

## Siguiente

[Uninstall & Recovery](/ein-agent/05-debug/uninstall-recovery/) — volver atrás
sin perder nada.
