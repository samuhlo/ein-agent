# SDD Project Context — ein-agent

## // 000. PROPOSITO

Workspace raíz del proyecto ein-agent: installer TypeScript/Bun + configuración de agente Ein/Pi.
Este `.sdd/config.md` define el contexto SDD para trabajo en el propio proyecto ein-agent.
No confundir con `ein-pi/agent/.sdd/config.md` (ese es el contexto runtime del agente deployed en `~/.pi/agent`).

---

## // 001. STACK DETECTADO

- **Stack lock:** `node`
- **Runtime / package manager:** Bun (en `installer/`), Node.js para runtime
- **Skills recomendadas:** `comment-style` (touches TypeScript y Markdown), `github-workflow` (delivery), `linear-workflow` (integración Linear)
- **Herramientas prohibidas:** `uv`, `pip`, `poetry`, Alembic, FastAPI. No aplicar patrones Python backend en este workspace.

---

## // 002. ESTRUCTURA CLAVE

```
ein-agent/                    # Raíz del workspace
├── installer/               # Installer TypeScript/Bun (agente + deploy)
│   ├── package.json         # Scripts: dev, typecheck, bundle-template, build:all
│   ├── src/                 # Código fuente del installer
│   └── tsconfig.json
├── ein-pi/agent/            # Configuración del agente (se deploya a ~/.pi/agent)
│   ├── agents/              # Agentes SDD .md (sdd-init.md, sdd-apply.md, etc.)
│   ├── assets/orchestrator.md
│   ├── chains/ein-sdd.chain.md
│   ├── extensions/         # Extensiones TypeScript del agente
│   └── lib/                 # Librerías del agente
├── tests/                   # Tests Bun (archivos *.test.ts)
│   └── *.test.ts
└── .sdd/                    # ← Este archivo (contexto SDD del workspace)
    └── config.md
```

---

## // 003. COMANDOS CONOCIDOS

```bash
# Typecheck del installer
cd installer && bun run typecheck

# Tests del proyecto (convencion Bun)
bun test

# Dev del installer
cd installer && bun run dev

# Build del installer
cd installer && bun run build:all
```

---

## // 004. RUTAS RELEVANTES

| Ruta | Proposito |
| ---- | --------- |
| `ein-pi/agent/agents/` | Agentes SDD (sdd-init, sdd-explore, sdd-apply, sdd-verify, sdd-design) |
| `ein-pi/agent/assets/orchestrator.md` | Orchestrator del agente (delegacion, routing) |
| `ein-pi/agent/chains/ein-sdd.chain.md` | Cadena ein-sdd: init → explore → design → tasks → apply → verify |
| `installer/package.json` | Deps, scripts, tipo de modulo (type: module) |
| `tests/*.test.ts` | Tests Bun del proyecto |

---

## // 005. REGLAS DE OPERACION

### NO tocar instalación global

- **`~/.pi/agent/`** — NO leer, NO modificar. El usuario instala/maniene `~/.pi/agent` manualmente.
- Este workspace contiene la **fuente** (`ein-pi/agent/`), no el destino deployado.
- EI installer copia archivos a `~/.pi/agent` — esa lógica vive en `installer/src/core/deploy.ts`.

### Cambios enfocados y presupuestos de lectura

- **Cambios mínimos**: smallest correct change wins.
- **Presupuesto de lectura**: antes de editar 4+ archivos, delegar a `sdd-explore` con contexto fresco.
- **Presupuesto de escritura**: multi-file write → delegar a `sdd-apply`.
- **Reads para verificación**: no abrir archivos nuevos sin necesidad durante verificación.

### Áreas prohibidas

- `ein-pi/agent/backups/` — no leer ni modificar backups.
- `ein-pi/agent/auth.json` — nunca leer/escribir credenciales.
- `ein-pi/agent/npm/node_modules/` — no instalar/desinstalar paquetes.

---

## // 006. SDD LITE vs FULL SDD

**SDD Lite** (por defecto en este workspace):
- Solo `.sdd/config.md` + fase solicitada.
- Sin planning/ext artifacts intermedios.

**Full SDD** (con complejidad que lo justifique):
- Carpeta `.sdd/` con planning, spec, design, proposal, apply, verify.

---

*Última actualización: 2026-06-18*
*SDD init executor — fase contexto mínimo*
