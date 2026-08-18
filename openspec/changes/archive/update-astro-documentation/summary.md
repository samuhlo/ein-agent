# Summary: update-astro-documentation

## // 000. RESUMEN

La documentación pública (seis páginas Astro) pasó de prometer paridad entre runtimes a
describir Ein tal como se entrega: Pi como referencia, Claude como relevo que consume
decisiones compartidas del disco, y límites explícitos en cada superficie. Separó dos
conceptos fundidos: el carril elegible (`standard` o `micro`) es orquestal, el runtime es
una superficie de operación.

## // 001. QUÉ CAMBIÓ

- `docs-site/src/content/docs/02-workflow/workflow-overview.md` — distingue carriles:
  `standard` (7 fases) y `micro` (5 fases, omite solo map+tasks), documenta persistencia
  por cambio de carril y TDD.
- `docs-site/src/content/docs/02-workflow/real-workflow-example.md` — marca el ejemplo como
  cambio `standard` histórico archivado, no receta universal.
- `docs-site/src/content/docs/04-reference/cli.md` — añade `/ein:status` y `/ein:settings`
  (Claude), panel vivo + `ctrl+shift+e` (Pi), bootstrap Codegraph y opt-outs
  (`--no-codegraph`, `--no-engram`).
- `docs-site/src/content/docs/03-runtimes/claude-code.md` — identifica Pi como referencia,
  Claude como relevo; explica continuidad bidireccional por checkpoint/disco, no por
  sesión; declara Cleaner/Architect como Pi-only.
- `docs-site/src/content/docs/03-runtimes/runtime-matrix.md` — reemplaza "equivalencia
  completa" por matriz explícita: compartidas (decisiones en disco), distintas (superficies
  por runtime), no equivalentes (skills, herramientas, MCP vivo).
- `docs-site/src/content/docs/05-debug/known-limitations.md` — relaciona `verify: pass` con
  criterios del cambio/carril; documenta `unreadable|unsupported|inactive|unhandled` como
  estados visibles (no defaults), solo `applied` = directiva inyectada; frontera
  Cleaner/Architect.

## // 002. CÓMO FUNCIONA POR DENTRO

El cambio separa el **carril de fases** (orquestación: `standard` sigue las 7, `micro`
omite map+tasks) del **runtime** (superficie operativa: Pi manda, Claude consume). Pi
guarda decisiones compartidas (carril, TDD, proyecto) en disco vía checkpoint; Claude lee
ese estado e informa `/ein:status`. Cleaner/Architect (auditoría automática) existen en Pi;
Claude reporta esa capacidad como "no aplicable". Los estados de traducción que no son
`applied` permanecen visibles en logs; nunca se convierten en defaults silenciosos.

## // 003. DECISIONES

1. Corregir el modelo **en cada contexto** (6 páginas), no una central nueva — reduce
   indirección, preserva navegación.
2. **Separar continuidad de paridad** — el disco permite el relevo, no la equivalencia de
   herramientas ni de sesiones.
3. Mantener el ejemplo como **histórico con nota contextual** — preserva valor sin
   reinventar el pasado.
4. **Usar estados explícitos** para la incertidumbre — fail-closed: una ausencia nunca se
   redacta como éxito.
5. **Puerta de evidencia** — solo se confirman capacidades entregadas; el roadmap diferido
   se marca como límite, no como funcionalidad.

## // 004. VERIFICACIÓN

- Build Astro: **PASS** (1.38s, 23 páginas).
- 10/10 tareas completadas (1.1–5.2 marcadas en `tasks.md`).
- 8/8 specs de diseño cubiertos (DOC-1…DOC-8).
- Búsquedas textuales: sin "siete fases" universales, sin paridad 1:1, sin Cleaner/Architect
  en Claude, sin defaults silenciosos.
- Frontmatter válido (sin `verified_rev` inventados), referencias internas OK.

**Nota histórica:** el cambio quedó bloqueado en `verify` desde su implementación por un
fallo del propio arnés, ajeno a la documentación: el planificador de participantes sellaba
cada pasaje con el estado del árbol entero y escribía su checkpoint dentro de ese árbol,
invalidando su propio sello; `ein-cleaner` respondía `source state is stale` en bucle. Se
reparó en el cambio `fix-harness-selfblocking-contracts` (release 0.72.0). La fase `verify`
se ejecutó finalmente en Claude, no en Pi, porque la puerta de participantes es Pi-only y
en ese runtime persiste un segundo fallo abierto: el resultado del Cleaner llega por un
evento `subagent_wait` que el arnés no reconoce, así que la auditoría se completa pero no
se registra. El Cleaner auditó este scope tres veces devolviendo `status: complete`. No se
saltó ninguna puerta: no existe en este runtime por diseño.

## // 005. PENDIENTE / RIESGOS

Ninguno en el contenido entregado: la documentación describe la arquitectura actual y no
promete lo que no existe. Queda abierto, fuera del alcance de este cambio, el fallo del
arnés en Pi (`subagent_wait` sin registrar la auditoría del Cleaner).
