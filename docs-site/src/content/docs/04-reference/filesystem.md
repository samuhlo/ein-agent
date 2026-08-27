---
title: "Filesystem"
description: "Qué directorios toca EIN, cuáles no, y dónde están tus backups."
sources: ["installer/src/core/paths.ts", "README.md", "installer/README.md"]
verified_rev: "eeceb7c"
---

Dónde vive EIN y, más importante, **qué no toca**.

## El mapa

```text
~/
├── .pi/agent/              tu Pi vanilla          ← EIN NO toca
├── .claude/                tu Claude vanilla      ← EIN NO toca
│
├── .pi-ein/agent/          casa de EIN para Pi
├── .claude-ein/            casa de EIN para Claude
│   └── bin/ein-cc-sdd      el CLI del flujo SDD
│
├── .local/bin/ein          el binario del instalador
├── .config/opencode-secrets/   claves de API
└── .engram-ein/             memoria persistente (opcional)
```

Y en cada proyecto donde uses EIN:

```text
<proyecto>/
├── openspec/
│   ├── changes/            cambios activos
│   │   └── archive/        cambios cerrados
│   ├── specs/              especificaciones canónicas
│   └── config.yaml         configuración SDD del proyecto
└── EIN.md                  contexto curado del proyecto (opcional)
```

## Qué pertenece a quién

| Ruta | Dueño | Se puede borrar |
| :--- | :--- | :--- |
| `~/.pi/agent`, `~/.claude` | tu runtime vanilla | no lo toques |
| `~/.pi-ein/agent`, `~/.claude-ein` | EIN | sí, con `ein-install uninstall` |
| `~/.local/bin/ein` | el instalador | sí, a mano |
| `~/.config/opencode-secrets` | tú | sí, pierdes las claves |
| `openspec/` | el proyecto | va a git, no lo borres |

## Dentro de la casa de EIN

```text
~/.pi-ein/agent/
├── agents/                  los ejecutores de fase
├── skills/
│   ├── local/               skills propias del workbench
│   └── downloaded/          skills de terceros
├── extensions/              extensiones del runtime
├── backups/installer/       ← aquí están tus backups
├── auth.json                autenticación (se conserva al desinstalar)
└── .ein-install.json        marcador de instalación
```

Ese marcador es lo que distingue una instalación de EIN de un directorio vanilla.
La migración solo mueve un árbol si lo encuentra: sin marcador, no toca nada.

## Backups

Van a `backups/installer/` dentro de la casa de EIN, como directorios `.snapshot`
respaldados por manifest. El restore exacto valida hashes y permisos, y conserva
el estado de usuario excluido. El árbol anterior queda como `.recovery-*` pineado
para reparación o limpieza explícita. Los `.tar.gz` legacy se detectan, pero esta
versión falla cerrado: requieren un instalador antiguo compatible o recuperación
manual.

Se crea uno automáticamente antes de cada `install` sobre un árbol existente,
cada `update`, cada `uninstall` y cada `restore`. No hay que acordarse.

```bash
ls ~/.pi-ein/agent/backups/installer/
ein-install restore
```

## Secrets

`~/.config/opencode-secrets/` guarda las claves de las integraciones opcionales,
un fichero por clave:

```text
linear-api-key
context7-api-key
minimax-api-key
```

Están fuera de la casa de EIN a propósito: `ein-install uninstall` no las borra, así que
reinstalar no te obliga a reconfigurarlas.

## Lo que EIN nunca toca

- Tus runtimes vanilla, salvo la migración explícita de una instalación legacy
  de EIN con marcador válido.
- Tu configuración de shell más allá de instalar las funciones `ein-pi` y
  `ein-cc`.
- El código de tus proyectos, fuera de los cambios que pidas y del directorio
  `openspec/`.

## Siguiente

[Tooling opcional](/ein-agent/04-reference/optional-tooling/) — las
integraciones y qué pasa si no están.
