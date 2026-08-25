status: complete

# Apply progress: style-parity-claude

**Lane:** micro · **TDD:** strict

## Group 001 — el estilo llega a la superficie de Claude

- **RED** — `tests/style-parity-claude.test.ts`: cuatro contratos. Tres fallan
  (el agente de apply, el coordinador, y la igualdad con lo compilado) y uno ya
  pasa: los agentes que no escriben codigo no cargan con el bloque, que es la
  frontera que el cambio no debe romper.
- **GREEN** — `compileClaudeSurface` compila el contrato de estilo y lo anexa a
  `STYLE_CONSUMERS` y al coordinador; `cc-ein/CLAUDE.md` se regenera desde sus
  fuentes. 4 pass.
- **TRIANGULATE** — cuatro ejes: presencia en el agente, presencia en el
  coordinador, **igualdad con lo recien compilado desde la skill** (que es lo
  que convierte un despliegue viejo en un fallo ruidoso en vez de silencioso), y
  ausencia en tres agentes que no escriben.
- **REFACTOR** — `STYLE_CONSUMERS` es una lista de uno, y esta escrita como
  lista a proposito: quien carga con 2 KB se declara, no se adivina.

## Group 002 — el payload, que es donde el test gano su sueldo

- **RED** — la suite completa: `packaged payload reaches the isolated Claude
  home with canonical orchestrator bytes` fallo con
  `Cannot find module '../ein-pi/agent/lib/style-contract.ts'` desde el sync
  **staged**.
- **DIAGNOSTICO** — `cc-ein/sync.ts` viaja en el payload, pero su closure de
  imports relativos no: el payload declara `cc-ein` y `ein-pi/core` como raices,
  y `ein-pi/agent/lib/` no esta en ninguna. Sin esto, la sincronizacion habria
  fallado en la maquina del usuario. El comentario del propio inventario lo
  avisa: *"a missing entry here becomes a compile failure on the user's machine,
  not at packaging time"*.
- **GREEN** — `CC_EIN_STYLE_CONTRACT` declarado en `CC_EIN_PAYLOAD_FILES` y en
  `CC_EIN_PAYLOAD_REQUIRED_PATHS`, re-exportado por `cc-payload.ts`. Se declara
  como fichero suelto y no como entry-point porque es puro: solo importa
  `node:fs` y `node:path`, asi que no arrastra closure.
- **TRIANGULATE** — el contrato del inventario fija la lista EXACTA y fallo al
  añadir la entrada. Es su proposito: engordar el payload tiene que ser un acto
  consciente. Se actualizo el contrato y el fixture de staging, no se relajo la
  comprobacion.
- **REFACTOR** — el bundle del template se regenero, porque `bun test` no lo
  reconstruye y el smoke compara bytes desplegados.

## Gates

- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.
- `bun test`: recorded in `verify-report.md`.
