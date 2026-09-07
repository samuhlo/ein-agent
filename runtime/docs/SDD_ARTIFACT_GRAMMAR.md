# SDD Artifact Grammar

Esta gramatica define el minimo comun que deben cumplir los artefactos SDD en Ein para evitar ambiguedad entre fases.

## Objetivo

- Estandarizar lo que cada fase lee y escribe.
- Reducir decisiones improvisadas entre subagentes.
- Facilitar continuidad despues de pausa o compaction.

## Artefactos Base

Ruta base por cambio:

`openspec/changes/<cambio>/`

Archivos esperados (flujo `ein-sdd`):

- `scope.md`
- `map.md`
- `design.md`
- `tasks.md`
- `apply-progress.md`
- `verify-report.md`

Configuracion global:

- `openspec/config.yaml`

## `openspec/config.yaml`

Campos minimos:

- `project`
- `stack_lock`: `node` | `frontend` | `fullstack` | `unknown`
- `runtime`
- `package_manager`
- `default_commands`: `test`, `build`, `lint`, `typecheck` (o `none`)
- `strict_tdd`
- `rules.design`, `rules.apply`, `rules.verify`

## `map.md`

Notas de exploracion: scope, riesgos, dependencias y prior art. Sin implementacion.

## `design.md`

Artefacto de decisión con dos secciones:

### A. Propuesta
- `Intent`, `Scope` (y non-goals), `Affected areas`, `Risks`, `Rollback`, `Success criteria`.

### B. Spec
- Requirements en estilo RFC 2119.
- Escenarios Given/When/Then por requirement observable.

Las tareas ejecutables viven en `tasks.md`; una sección legacy `C. Tasks` se
normaliza allí y no constituye un segundo contrato de escritura.

## `tasks.md`

`tasks.md` conserva la explicación humana y produce un `apply-packet/v2` por
grupo. El grupo es la unidad que delega el orquestador.

Forma canónica:

```markdown
# Tasks — <cambio>

status: ready
blocked_by: none

## // 001. <grupo>

- outcome: <resultado observable del grupo>

- [ ] 1.1 <paso accionable>
  - skills: `none`
  - why: <por qué existe>
  - learn: <lección breve>
  - architecture: <invariante o propiedad>
  - avoid: <alternativa que no debe ocurrir>
  - read: `ruta/contexto.ts`, `ruta/test-existente.test.ts`
  - edit: `ruta/cambio.ts` | modify | <intención concreta>
  - behavior: <comportamiento observable>
  - stop: <condición específica que devuelve el control>
  - verify: `bun test tests/focused.test.ts`
```

Reglas consumidas por máquina:

1. Cada grupo declara un único `outcome:` antes del primer checkbox.
2. `read:` enumera contexto de lectura. Toda ruta de `edit:` se añade también a
   ese contexto.
3. Cada `edit:` tiene exactamente tres celdas separadas por `|`: ruta relativa,
   operación `create|modify|delete` e intención. Puede repetirse para una tarea.
4. Solo `edit:` concede escritura. Una ruta nombrada por `read:` o `verify:` no
   se vuelve escribible.
5. Cada tarea declara al menos un `behavior:`, un `stop:` específico y un
   `verify:`. El check se asocia con los comportamientos de esa tarea.
6. Al reanudar, el packet incluye únicamente checkboxes pendientes del grupo.
7. El compilador sella el packet con los SHA-256 actuales de `design.md` y
   `tasks.md`; esos digests no los escribe el modelo.

## `apply-progress.md`

Secciones minimas por batch:

- `Batch`
- `Tareas completadas`
- `Files changed`
- `TDD Cycle Evidence` (cuando strict TDD activo)
- `Decisiones tecnicas`
- `Riesgos`
- `Checks ejecutados` (o `none`)
- `Siguiente paso`

### Gramatica de `Files changed` (parseada por `changedScope()`)

Esta seccion es la unica excepcion acotada a la regla de compacidad de `sdd-apply.md`: es el
alcance leido por maquina de la pasada Cleaner/Architect (`ein-pi/agent/lib/sdd-participants.ts`),
no prosa para un lector humano. El parser exige exactamente lo siguiente:

1. Encabezado, comparado sin distinguir mayusculas: `files changed`, `changed files`,
   `archivos modificados` o `archivos cambiados`, con prefijo opcional `#` a `######` y `:` final
   opcional, sin nada mas en la linea. Forma canonica: `## Files changed`.
2. La seccion termina en el siguiente encabezado markdown, asi que debe ir seguida de otro
   encabezado.
3. **Cada span entre backticks dentro de la seccion se interpreta como una ruta.** No hay prosa de
   codigo, comandos ni `` `tipos` `` inline: cualquier backtick que no sea una ruta rompe el
   contrato.
4. Rutas: relativas a la raiz del repo, separador `/`, sin `/` inicial, sin `\`, sin segmentos
   `.`/`..`/vacios, sin duplicados, al menos una.
5. Cada ruta debe resolver a un archivo regular existente sin componentes symlink en el momento de
   la admision — un archivo borrado o renombrado por el apply NO debe listarse.
6. Ningun segmento de ruta puede ser `.atl`, `.git`, `.pi`, `build`, `coverage`, `dist`,
   `generated`, `node_modules`, `runtime` o `vendor`.

Ejemplo canonico (ejecutable: este bloque se extrae y se alimenta a `planSddParticipants` en la
suite de tests):

```markdown
status: complete

## Files changed

- `runtime/docs/SDD_ARTIFACT_GRAMMAR.md`

## Siguiente paso
```

## `verify-report.md`

Secciones minimas:

- `Estado global`: `Passed` | `Failed` | `Partial` | `Not Ready`
- `Comandos/checks` con resultado individual
- `Criterios revisados`
- `Strict TDD compliance` (cuando aplique)
- `Riesgos`
- `Decision`
- `Siguiente paso`

Regla:

- Si un check no se ejecuta, debe figurar como `Skipped: <motivo>`.

## `summary.md`

Es el único registro que permanece después del cierre. Debe empezar con:

```markdown
status: complete
change: <nombre>
work_groups: <entero positivo>
verification_status: pass
```

Después conserva, con estructura proporcional al cambio, el resultado, el mecanismo, las
decisiones, la verificación y los riesgos. Cada comprobación reutilizable se
declara como `- verify: \`<comando exacto>\``.

Los demás artefactos son una mesa de trabajo: permiten retomar y comprobar el
cambio mientras está activo. El cierre requiere que el resumen sea posterior a
apply/verify. Antes de eliminar los archivos intermedios, incorpora en
`summary.md` los informes presentes de aplicación, verificación y sincronización.
El archivo conserva ese único resumen con su evidencia. Los encabezados y las
comillas del comando no bloquean el cierre; los metadatos sí tienen consumidores.
Cerrar no modifica `EIN.md`.

## Gates Entre Fases

El flujo `ein-sdd` se lanza por lenguaje natural o por la chain (no por comandos `/ein:sdd:*`). Los gates entre fases son:

- La fase `design` requiere `openspec/config.yaml` y los artefactos `scope.md` + `map.md`.
- La fase `apply` requiere `openspec/config.yaml` y `design.md` (sección Tareas).
- La fase `verify` requiere `openspec/config.yaml`, `design.md` y `apply-progress.md` cuando hubo implementación.
- Si no hay tareas pendientes, `apply` debe parar y derivar a `verify`.

## Contrato De Resultado Entre Fases

Cada fase debe devolver al menos:

- `estado`
- `artefactos leidos`
- `artefactos escritos`
- `riesgos`
- `siguiente paso`
- `skill_resolution`

Esto no obliga un formato JSON en la respuesta al usuario. La salida final puede ser Markdown humano, pero estos elementos deben estar presentes.
