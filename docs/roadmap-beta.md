# Roadmap a la beta: verdad canónica y criterios de salida

> **Superseded historical record.** This document is not authoritative for current status or sequencing. Use the [canonical EIN product roadmap](roadmap-features-ein.md).
>
> **Baseline actual del repositorio:** `installer 0.42.0` (`installer-v0.42.0`).
> Este baseline describe el estado publicado del instalador; no demuestra que el
> camino del launcher beta esté completo.

Este documento es el registro mantenido del estado beta, su evidencia y sus
criterios de salida. `docs/roadmap-features-ein.md` conserva la autoridad sobre
la priorización canónica y el orden de dependencias A–L; este documento no crea
una roadmap paralela.

## 00. Verdad actual

- El baseline local actual es `installer 0.42.0`: coinciden el tag local
  `installer-v0.42.0`, `installer/package.json`, `installer/src/core/version.ts`
  y la cabecera vigente de `CHANGELOG.md` (`[0.42.0] - 2026-08-05`).
- La base actual del instalador incluye la selección explícita
  `--runtime pi|claude|both`, superficies Pi y Claude aisladas y metadatos de
  escenarios de instalador. Es evidencia de preparación del instalador, no de
  finalización del launcher.
- `core-parity` es un fundamento histórico completado: su evidencia archivada
  registra `status: pass` y `behavior_coverage: verified`, con paridad generada,
  sincronización explícita de OpenSpec hacia Claude y sus regresiones cubiertas.
  El límite conservado es que no se ejercitó Claude MCP externo/en vivo.
- `installer-beta` es otro fundamento histórico con pase local y cobertura
  `partial`. Su evidencia conserva tres límites: no hubo ejecución nativa de
  macOS, quedó sin asertar una rama de fallo del Bun compartido y no se afirmó
  ningún workflow remoto ni publicación real de `0.41.0`.
- No existe evidencia de finalización de B, C, D o E. Por tanto, el baseline
  `0.42.0`, `core-parity` y `installer-beta` no permiten afirmar que el launcher
  beta esté listo.

La afirmación vigente es: el instalador y la base de workbench Pi/Claude tienen
evidencia de release y de fundamentos históricos; el camino prometido del
launcher sigue siendo la secuencia A–E siguiente.

## 01. Secuencia canónica A–E

| Fase | Propósito | Estado en este registro |
|---|---|---|
| **A — verdad beta** | Reconciliar baseline, evidencia, alcance y criterios de salida. | Registro documental mantenido aquí; no es una afirmación de que B–E estén completos. |
| **B — estado compartido** | Definir la proyección determinista del estado del proyecto, OpenSpec, Git, EIN, runtimes y frescura de verificación. | Sin evidencia de implementación completa. |
| **C — adapters de runtime** | Exponer una superficie honesta de sesiones Pi y Claude: listar, crear, reanudar y lanzar. | Sin evidencia de implementación completa. |
| **D — launcher/workbench mínimo** | Seleccionar proyecto y runtime, mostrar fase y siguiente paso, gestionar sesiones y ofrecer acceso compacto a doctor. | Sin evidencia de implementación completa. |
| **E — E2E del launcher** | Probar éxito, errores, estado incompleto y la invalidación de evidencia obsoleta tras cambios relevantes. | Sin evidencia de implementación completa. |

La continuidad entre Pi y Claude transfiere estado normalizado del proyecto, no
historiales privados de conversación. El instalador mantiene instalación,
actualización, release y doctor; el launcher futuro solo tendrá el acceso
acotado a diagnóstico que corresponda a D.

## 02. Autoridad y evidencia

| Fuente | Uso y reconciliación |
|---|---|
| [`docs/roadmap-features-ein.md`](roadmap-features-ein.md) | Autoridad para alcance, exclusiones y orden A–L. A precede a B–E. |
| `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md` y tag local `installer-v0.42.0` | Baseline de release del repositorio; no son evidencia de readiness del launcher. |
| [`core-parity/summary.md`](../openspec/changes/archive/core-parity/summary.md) y [`core-parity/verify-report.md`](../openspec/changes/archive/core-parity/verify-report.md) | Evidencia histórica de paridad completada, con el límite de Claude MCP externo/en vivo. |
| [`installer-beta/summary.md`](../openspec/changes/archive/installer-beta/summary.md) y [`installer-beta/verify-report.md`](../openspec/changes/archive/installer-beta/verify-report.md) | Evidencia histórica de pase local con cobertura parcial; no convierte las lagunas de plataforma o workflow en cobertura universal. |
| `.github/workflows/*`, `e2e/*` y el README del instalador | Evidencia de superficies y checks disponibles. La definición de un workflow no prueba que se haya ejecutado remotamente. |

Los changelogs, workflows, E2E y artefactos SDD archivados son evidencia
inmutable para esta reconciliación. No se reescriben para hacer coincidir la
historia con el estado actual.

## 03. Matriz de alcance beta

La clasificación es un contrato de límites para A–E. **Requirement** pertenece
al compromiso beta; **posterior** puede revisarse en una fase posterior o en un
change nombrado; **discarded for beta** no puede convertirse en criterio de
aceptación implícito. “Descartado” no significa necesariamente prohibido para
siempre: significa excluido de una ampliación no planificada de A–E.

### Requirements

| Requirement | Tratamiento canónico | Límite |
|---|---|---|
| Seleccionar un proyecto y Pi o Claude | D, usando B/C | El flujo mínimo admite solo los runtimes soportados; no implica un runtime genérico adicional. |
| Mostrar change/fase activa de OpenSpec y siguiente paso | B/D | OpenSpec es la autoridad; los estados desconocido o incompleto deben ser visibles. |
| Listar, crear, reanudar y lanzar sesiones | C/D | Pi y Claude comparten una superficie honesta sin fingir ciclos de vida idénticos. |
| Acceso compacto a doctor | D | Se conserva la propiedad del instalador/doctor; el launcher no absorbe la instalación. |
| Proyección determinista del estado compartido del proyecto | B | Incluye proyecto, OpenSpec, contexto EIN, Git exacto, capacidades/referencias de runtime y frescura de verificación. |
| Continuidad entre Pi y Claude mediante estado normalizado | B/C/D | Se transfiere estado del proyecto, nunca historial privado de conversación. |
| Evidencia de verificación ligada al estado exacto del código e invalidada tras cambios Git relevantes | B/E | El launcher no presenta evidencia antigua como vigente después de un cambio relevante. |
| E2E específica del launcher para éxito, fallo y verificación obsoleta | E | Debe ser reproducible y estar ligada al estado exacto comprobado; la E2E del instalador no sustituye esta cobertura. |

### Posterior / beta-excluded

| Propuesta | Tratamiento canónico | Límite |
|---|---|---|
| Editar toda la configuración del proyecto/global desde el launcher | Posterior; la redacción MVP del catálogo quedó supersedida | B puede exponer contexto, pero no concede propiedad de mutación. |
| Updater universal/avanzado y checks de actualización para cada runtime | Posterior y excluido de beta; corresponde a F (`shared-config-update-advisor`) | A–E pueden mostrar límites del instalador, pero no implementar ni prometer ownership del updater. |
| Resúmenes de una frase para cada sesión previa | Posterior | No es requisito de D salvo adopción explícita en otro change. |
| Soporte de agentes futuros arbitrarios | Posterior | Los únicos runtimes soportados hoy son Pi y Claude. |
| Procesos cleaner y architect | Posterior; corresponden a slices posteriores F–K | Ningún criterio de beta depende de ellos. |
| Paralelismo seguro con worktrees aislados y reglas de ownership | Posterior; corresponde a L | A–E no promete writers paralelos ni seguridad de worktree compartido. |

### Discarded for beta

| Propuesta | Tratamiento canónico | Límite |
|---|---|---|
| Dashboard/TUI general, navegación amplia o terminal application tipo LazyVim | Descartado para beta | D es un CLI/workbench mínimo, no un dashboard general. |
| Expandir el TUI del instalador para convertirlo en launcher | Descartado para beta | El launcher es una CLI/workbench separada. |
| Instalación o actualización propiedad del launcher | Descartado para beta | No se duplican instalación, package management, release ni transacciones del updater. |
| Migrar o exponer historiales privados de conversación entre runtimes | Descartado para beta | Las sesiones siguen siendo privadas; solo se transfiere estado normalizado. |
| Writers paralelos o mutaciones cleaner/architect dentro del launcher beta | Descartado para beta | Toda mutación futura necesita su propio SDD, ownership y verificación fresca. |

## 04. Criterios explícitos de salida A–E

Estos son gates medibles, no afirmaciones de que el repositorio actual los haya
satisfecho.

### BE-01 — Verdad reconciliada y trazabilidad

- Existe un registro mantenido con baseline, matriz, orden A–E, exclusiones y
  referencias a la evidencia.
- Cada claim histórico de este roadmap, de los READMEs o del catálogo está
  corregido, marcado como histórico o etiquetado como no autoritativo.
- La evidencia de release está separada de la readiness del launcher.
- Ningún documento obsoleto se usa como criterio sin una decisión de
  reconciliación explícita.

### BE-02 — Contrato de estado compartido inequívoco

- B define la fuente y representación autoritativas para identidad del
  proyecto, change/fase/siguiente paso de OpenSpec, contexto estable de EIN,
  estado exacto de Git, capacidades/referencias de runtime y frescura de
  verificación.
- La representación distingue valores conocidos, incompletos, no disponibles
  y obsoletos, sin inventar estado actual.
- Define qué cambios invalidan qué evidencia y cómo se muestra esa
  invalidación; un cambio Git relevante deja obsoleta la verificación anterior.
- Los historiales privados de Pi y Claude quedan explícitamente fuera del
  estado compartido.

### BE-03 — Adapters Pi y Claude con superficie común honesta

- C soporta listar, crear, reanudar y lanzar para ambos runtimes, o expone un
  estado determinista de capacidad/error cuando una operación no sea posible.
- Las diferencias, errores y límites de cada runtime siguen visibles; una
  interfaz común no implica ciclos de vida idénticos.
- Reanudar o cambiar de runtime identifica el estado normalizado usado y nunca
  afirma que se transfirió historial privado.

### BE-04 — Launcher mínimo sin absorber el instalador

- D permite seleccionar proyecto y Pi/Claude, ver la fase OpenSpec y el
  siguiente paso, gestionar operaciones comunes de sesión y llegar al doctor
  compacto.
- Usa el contrato de B y los adapters de C como fuente de verdad única.
- Presenta de forma visible la verificación incompleta u obsoleta.
- No implementa instalación, transacciones de actualización, updater universal,
  dashboard general, mutaciones cleaner/architect ni writers paralelos.

### BE-05 — E2E del launcher reproducible y consciente de frescura

- E cubre el camino feliz desde selección de proyecto/runtime hasta lanzamiento
  de sesión.
- Cubre errores de runtime/sesión, estado de proyecto no disponible o
  incompleto y diagnósticos accionables.
- Cambia el estado de código relevante después de verificar y demuestra que la
  evidencia previa queda obsoleta/invalidada, no heredada automáticamente.
- Identifica el estado exacto verificado y es reproducible sin proveedor externo
  en vivo ni historial privado.
- La E2E del instalador sigue siendo señal separada de prerequisito/regresión;
  por sí sola no prueba E ni la beta del launcher.

### BE-06 — Evidencia de release actual y honesta en el límite beta

- Versión de package, marcador de source, changelog, tag, outputs del workflow y
  checksums coinciden antes de publicar.
- CI y la E2E requerida del launcher pasan para el estado exacto del candidato;
  cualquier laguna manual o nativa queda registrada y no se infiere.
- La publicación ocurre únicamente mediante el workflow de release de GitHub
  Actions y después de las autorizaciones y gates normales de entrega. Este
  registro no publica ni despacha workflows.

## 05. E2E del instalador frente a E2E del launcher

Los workflows disponibles demuestran que existen superficies ejecutables, no que
haya ocurrido un run remoto. La E2E manual del instalador y su metadata cubren
escenarios de runtime inválido, Pi por defecto, Claude-only y Both; los casos
válidos se repiten para convergencia y Both comprueba Pi antes de Claude.

Esos escenarios validan selección de runtime y despliegue del instalador. No
validan selección de proyecto, proyección de change/fase de OpenSpec, ciclo de
vida de sesiones, cambio de runtime ni invalidación de frescura de verificación.
Esas pruebas pertenecen a E y deben ser específicas del launcher. No se afirma
que se haya ejecutado un workflow remoto ni que se hayan verificado assets de
release sin evidencia independiente capturada.

## 06. Claims históricos reconciliados

Las afirmaciones siguientes pertenecían al snapshot anterior a la base 0.41.0 y
no son criterios vigentes. Se conserva su contexto en vez de borrar la historia:

| Afirmación antigua | Tratamiento vigente |
|---|---|
| `0.40.0` era la release más reciente | Supersedida por el baseline local `installer 0.42.0`, sustentado por tag, package, source marker y changelog del 2026-08-05. `0.40.0` queda como contexto histórico. |
| `core-parity` seguía pendiente de verificación/cierre | Supersedida por el `summary` y `verify-report` archivados: `status: pass` y `behavior_coverage: verified`. Se conserva el límite de que Claude MCP externo/en vivo no fue ejercitado. |
| `installer-beta` y la publicación seguían pendientes como si no hubiera evidencia | Reconciliada: hay un pase local histórico con `behavior_coverage: partial`, pero no evidencia nativa de macOS, una rama de fallo de Bun compartido, ni un workflow/publicación remota real de `0.41.0`. |
| La E2E del instalador nunca se había ejecutado | Era una afirmación del snapshot antiguo. Existe evidencia local histórica de escenarios del instalador y la superficie de workflow es manual; eso no prueba un run remoto ni la E2E del launcher. |
| La selección no interactiva de runtime o `--runtime` no existía | Supersedida por la capacidad actual documentada en la base 0.41/0.42: `--runtime pi|claude|both`. Sigue siendo una capacidad del instalador, no del launcher futuro. |

La evidencia archivada y `CHANGELOG.md` no se modifican para aplicar estas
anotaciones. Cualquier claim de ejecución remota, publicación, macOS nativo,
Claude MCP vivo o readiness B–E requiere evidencia nueva y específica.

## 07. Límites de este cambio

Esta reconciliación es documental y no crea delta de spec (`spec_delta: none`).
No implementa launcher, estado compartido, adapters, sesiones, doctor, frescura,
E2E, workflows, release ni publicación. El catálogo de ideas, la roadmap
canónica, los changelogs, los workflows, la E2E existente y los artefactos
archivados permanecen como inputs o evidencia de solo lectura.
