# SDD Explore — cleanup-legacy-ein-pi-folders

## // 000. HALLAZGO INICIAL

Exploración mínima del batiburrillo de carpetas `ein-pi/` fuera de la fuente canónica `ein-pi/agent/`.

---

## // 001. ESTRUCTURA ACTUAL

```
ein-pi/
├── agent/                    # CANÓNICO — this is the source
│   ├── agents/               # agentes reales (sdd-*.md + ein-*.md)
│   ├── chains/               # chains reales (ein-sdd.chain.md)
│   ├── settings.json         # CONFIGURACIÓN REAL (48 líneas)
│   └── ...
├── agents/                   # LEGACY — 11 archivos .md duplicados/antiguos
│   ├── sdd-apply.md          # DIFERENTE del canónico
│   ├── sdd-archive.md        # SOLO aquí (no existe en canónico)
│   ├── sdd-design.md         # DIFERENTE del canónico
│   ├── sdd-explore.md        # DIFERENTE del canónico
│   ├── sdd-init.md           # DIFERENTE del canónico
│   ├── sdd-onboard.md        # SOLO aquí
│   ├── sdd-proposal.md       # SOLO aquí
│   ├── sdd-spec.md           # SOLO aquí
│   ├── sdd-sync.md           # SOLO aquí
│   ├── sdd-tasks.md          # SOLO aquí
│   └── sdd-verify.md         # DIFERENTE del canónico
├── chains/                   # LEGACY — 3 archivos duplicados/antiguos
│   ├── sdd-full.chain.md     # SOLO aquí (no existe en canónico)
│   ├── sdd-plan.chain.md     # SOLO aquí
│   └── sdd-verify.chain.md   # SOLO aquí
├── openspec/                 # LEGACY — 2 archivos, sin refs vivas
│   ├── README.md
│   └── config.yaml
├── ein/                      # LEGACY — 1 archivo huérfano
│   └── persona.json
├── samuhlo/                  # LEGACY — 1 archivo huérfano
│   └── persona.json
└── settings.json             # LEGACY — VACÍO {} vs canónico (48 líneas)
```

**Conteo**: 6 carpetas legacy + 1 archivo legacy. Todos tracked por git.

---

## // 002. REFERENCIAS VIVAS ENCONTRADAS

| Legacy path | Referencias vivas | Notas |
|-------------|-------------------|-------|
| `ein-pi/agents/*` | **1 lugar**: `sdd-token-budget-scope-gate/explore.md` | Cambio no entregado (untracked). Doc incorrecto — debería apuntar a `ein-pi/agent/agents/` |
| `ein-pi/chains/*` | **Ninguna** | — |
| `ein-pi/openspec/*` | **Ninguna** | — |
| `ein-pi/ein/*` | **Ninguna** | — |
| `ein-pi/samuhlo/*` | **Ninguna** | — |
| `ein-pi/settings.json` | **Ninguna** | — |

**Conclusión**: solo `sdd-token-budget-scope-gate` referencia paths legacy, y es una documentación de planning que tiene los paths intercambiados (bug).

---

## // 003. COMPARACIÓN: LEGACY vs CANÓNICO

### `ein-pi/agents/` vs `ein-pi/agent/agents/`

| Archivo legacy | Estado vs canónico |
|----------------|---------------------|
| `sdd-apply.md` | **Diferente** — contenido diverge |
| `sdd-archive.md` | **Solo en legacy** — no existe en canónico |
| `sdd-design.md` | **Diferente** |
| `sdd-explore.md` | **Diferente** |
| `sdd-init.md` | **Diferente** |
| `sdd-onboard.md` | **Solo en legacy** |
| `sdd-proposal.md` | **Solo en legacy** |
| `sdd-spec.md` | **Solo en legacy** |
| `sdd-sync.md` | **Solo en legacy** |
| `sdd-tasks.md` | **Solo en legacy** |
| `sdd-verify.md` | **Diferente** |
| `ein-git.md` | **Solo en canónico** |
| `ein-linear.md` | **Solo en canónico** |
| `ein-readme.md` | **Solo en canónico** |

### `ein-pi/chains/` vs `ein-pi/agent/chains/`

| Archivo legacy | Estado vs canónico |
|----------------|---------------------|
| `sdd-full.chain.md` | **Solo en legacy** |
| `sdd-plan.chain.md` | **Solo en legacy** |
| `sdd-verify.chain.md` | **Solo en legacy** |
| `ein-sdd.chain.md` | **Solo en canónico** |

### `ein-pi/settings.json` vs `ein-pi/agent/settings.json`

| | Legacy | Canónico |
|---|---|---|
| Contenido | `{}` (vacío) | 48 líneas de configuración real |

---

## // 004. FUENTE CANÓNICA CONFIRMADA

- **README.md** (línea 280): "Los cambios al workbench van en `ein-pi/agent/`"
- **installer/scripts/bundle-template.ts** (línea 25): `SOURCE = join(REPO_ROOT, "ein-pi", "agent")`
- **.gitignore**: no ignora nada dentro de `ein-pi/agent/` (solo runtime noise)
- **.sdd/config.md** (línea 28): `ein-pi/agent/` como configuración del agente deployado

---

## // 005. RIESGO: `sdd-token-budget-scope-gate`

El cambio no entregado (`sdd-token-budget-scope-gate/`) tiene un **bug de documentación**: su `explore.md` lista `ein-pi/agents/sdd-init.md` y `ein-pi/agents/sdd-explore.md` como archivos afectados. Esos paths son los legacy, no los canónicos.

**Impacto**: si se implementara ese cambio siguiendo su documentación actual, editaría los archivos equivocados.

**Mitigación propuesta**: la tarea de cleanup incluirá una tarea de corrección de paths para `sdd-token-budget-scope-gate`. El usuario dijo "no los reviertas" — esto significa no descartar su trabajo, sino corregir la referencia a paths canónicos.

---

## // 006. DECISIONES DE ALCANCE

1. **Legacies a borrar**: `ein-pi/agents/`, `ein-pi/chains/`, `ein-pi/openspec/`, `ein-pi/ein/`, `ein-pi/samuhlo/`, `ein-pi/settings.json`
2. **NO tocar**:
   - Nada dentro de `ein-pi/agent/` (fuente canónica)
   - `sdd-token-budget-scope-gate/` — solo corregir refs de paths, no descartarlo
   - Carpetas runtime noise ignoradas por `.gitignore` dentro de `ein-pi/agent/`
3. **Documentación**: actualizar README para clarificar estructura canónica
4. **Test de contrato**: fail si aparecen refs activas a legacy paths en runtime/installer/docs clave

---

## // 007. NOTAS PARA EL PLAN

- `.sdd/config.md` menciona "delegar con contexto fresco" (línea 83). Esto NO contradice el scope gate — son reglas ortogonales. El scope gate controla qué archivos se tocan; "contexto fresco" controla cómo se delega. **No requiere cambio**.
- La limpieza de archivos legacy es segura porque no hay refs vivas fuera de `sdd-token-budget-scope-gate` (y ese tiene bug de docs).
