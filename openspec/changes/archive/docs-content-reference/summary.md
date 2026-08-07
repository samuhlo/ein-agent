# Summary — docs-content-reference

status: pass
change: docs-content-reference
verified_rev: "2f67c73"

SLICE 2 de 2. Con este cierre, la fase A de la documentación pública de EIN
queda completa: 21 páginas de esqueleto en seis áreas. **Esqueletos, no páginas
redactadas**: la prosa es la fase D y la web la fase C. No hay documentación
publicada.

## Qué cambió

Once páginas esqueleto bajo `docs-site/src/content/docs/`:

- `03-runtimes/{runtime-overview,pi-coding-agent,claude-code,runtime-matrix}.md`
- `04-reference/{cli,filesystem,optional-tooling}.md`
- `05-debug/{troubleshooting,doctor,known-limitations,uninstall-recovery}.md`

Más `openspec/changes/docs-content-reference/gap-inventory.md`: seis decisiones
de hueco y cuatro defectos de fuente anotados.

**Cero ficheros modificados.** SLICE 1 intacto, incluidos sus artefactos
archivados y sus 10 páginas.

## Cómo funciona por dentro

**Contrato heredado sin rediseño.** Frontmatter de cuatro claves en orden,
siete `##` fijos, bloque `PENDIENTE-D` con `falta:`/`fuentes:`/`lineas:`,
prohibición de literales de versión y tag `[BETA-EXCLUDED]`. Es exactamente el
de SLICE 1, replicado sin cambio.

**Runtime Matrix.** Seis filas defendibles —instalación interactiva y no
interactiva, launcher y aislamiento, despliegue del cerebro, ciclo SDD
determinista, migración legacy—, cada una con evidencia en spec o en código.
El MCP externo (Context7, Engram, Linear, Codegraph, Hypa) queda excluido y
marcado `[BETA-EXCLUDED]` porque
`openspec/changes/archive/core-parity/verify-report.md:163` declara que nunca se
ejercitó contra servicios en vivo.

**Solapamientos, bajados a reglas mecánicas.** Las constantes de ruta viven solo
en `filesystem.md`; los flags (`--yes`, `--dry-run`, `--runtime`, `--no-*`) solo
en `cli.md`; los niveles `WARN`/`FAIL` solo en `doctor.md`, y
`troubleshooting.md` remite por enlace en vez de repetirlos. La segregación es
léxica y por tanto comprobable por comando.

**Known Limitations.** Esqueleto completo con fuente única
(`docs/roadmap-beta.md`) y un `## Siguiente paso` en texto plano que declara la
incompletitud. El bloqueo vive en `gap-inventory.md` con su clave
`desbloqueante:`, no en la página. Ninguna ruta de la rama sin mergear se cita
en ningún sitio.

**Cadena de lectura.** Diez páginas encadenadas: runtime-overview →
pi-coding-agent → claude-code → runtime-matrix → cli → filesystem →
optional-tooling → doctor → troubleshooting → uninstall-recovery.
`known-limitations.md` queda fuera de la cadena, intencionalmente.

## Decisiones

**Solo filas defendibles en Runtime Matrix.** La asimetría de skills y
acceptance, que es propia del runtime Pi, se declara en `claude-code.md` bajo
«Huecos honestos frente a Pi», no como fila de una tabla de paridad. La
autoridad de qué pudo verificarse en vivo es `core-parity/verify-report.md:163`.

**Honestidad de estado.** Ninguna página describe el launcher, el estado
compartido de proyecto ni los adaptadores de sesión como existentes. Known
Limitations se declara *bloqueada*, no *incompleta*, con una condición concreta
de desbloqueo.

**Vocabulario de `estado:` extendido.** SLICE 1 admitía dos valores y por eso no
tenía forma correcta de expresar «hueco que pertenece a otro cambio». Aquí crece
a cuatro: `esqueleto-en-A`, `cerrado-en-cambio-anterior`, `bloqueado-por-merge`
y `bloqueado-por-evidencia`, cada uno con su clave condicional. El
`gap-inventory.md` de SLICE 1 **no se edita**: está archivado y es evidencia
inmutable; se referencia como precedente.

**Sin enlaces cruzados a SLICE 1** (CT-6′). Las once páginas enlazan solo entre
sí; la continuidad hacia la otra mitad se expresa en texto plano.

## Verificación

`status: pass` — 23/23 criterios mecánicos de `design.md §D`.

- **D1** — 11 rutas exactas, cuatro claves de frontmatter en orden,
  `verified_rev: "2f67c73"` uniforme, todas las fuentes declaradas existen.
- **D2** — siete `##` por página, 39 `###` en total, un bloque `PENDIENTE-D` por
  sección con sus tres claves en orden, pureza SK-3/SK-4 con residuo cero.
- **D3** — seis `###` de Runtime Matrix en orden, cada uno con fuente de spec o
  código; MCP ausente salvo en la línea `falta:` con `[BETA-EXCLUDED]`.
- **D4** — rutas segregadas a `filesystem.md`, flags a `cli.md`, literales
  `WARN`/`FAIL` a `doctor.md`; ninguna mención de workbench, estado compartido
  ni adaptadores de sesión.
- **D5** — seis huecos con sus claves, tabla de cuatro defectos, declaración
  `GI-6′` presente, SLICE 1 intacto.

**TDD.** `openspec/config.yaml` declara `strict_tdd: true` sin `test_command` y
sin runner detectado; la salida es markdown sin comportamiento ejecutable. Se
declaró `tdd: not-applicable` con causa concreta y los 23 criterios hicieron de
gate mecánico sustitutivo. `openspec/config.yaml` quedó intacto.

## Qué queda abierto

1. **Known Limitations** (`estado: bloqueado-por-merge`): redacción imposible
   hasta que `feat/shared-project-state-contract` entre en `main`. Hasta
   entonces su matriz beta no es fuente legible desde esta rama.

2. **Paridad MCP** (`estado: bloqueado-por-evidencia`): requiere verificación
   reproducible contra servicios en vivo. Hoy `cc-ein/README.md:30` la describe
   como verificada manualmente y `core-parity/verify-report.md:163` registra la
   evidencia que falta. **Este sexto hueco lo añadió la fase apply sin que el
   design lo previera**; `sdd-verify` lo convalidó al validarlo, pero no emitió
   un dictamen explícito sobre si excedía el contrato.

3. **Defectos de fuente**, propietario «fuera de alcance»: versión desfasada en
   `README.md:121`, flag omitido en `README.md:117`, y verificación manual de
   MCP en `cc-ein/README.md:30`. Quedan para un cambio de mantenimiento
   posterior sobre esos ficheros.

4. **Cadena de lectura incompleta entre mitades**:
   `02-workflow/real-workflow-example.md:110` nombra el área Runtimes en texto
   plano porque cuando se escribió no existía. Cerrar esa cadena es trabajo
   pendiente de una fase posterior.

5. **Fases B–E**, documentadas en
   [`docs/handoff-docs-site.md`](../../../docs/handoff-docs-site.md): B
   (`docs-sync-contract`), C (`docs-site-shell`), D (`docs-beta-content`) y E
   (`readme-slim`, obligatoriamente la última).

6. **Fricciones de herramienta** encontradas durante ambos cambios, registradas
   fuera de OpenSpec en
   [`docs/fricciones-dogfooding.md`](../../../docs/fricciones-dogfooding.md)
   como material para el artículo de lanzamiento.
