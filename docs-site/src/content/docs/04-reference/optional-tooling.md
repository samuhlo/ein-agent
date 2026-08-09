---
title: "Tooling opcional"
description: "Las integraciones que EIN puede usar, y qué pasa cuando no están."
sources: ["installer/src/core/engram.ts", "installer/src/core/secrets.ts", "installer/src/core/deps.ts", "ein-pi/agent/mcp.json"]
verified_rev: "29861f5"
---

EIN funciona sin ninguna de estas. Todas se pueden omitir en la instalación con
su flag, y todas degradan sin romper nada.

:::note
Ninguna es obligatoria. Si una no está disponible, EIN sigue funcionando y lo
que se pierde es la capacidad concreta, no el flujo.
:::

## Context7

**Qué aporta.** Documentación actualizada de librerías y frameworks, buscada por
tema en lugar de por memoria del modelo.

**Cuándo se usa.** Cuando el trabajo toca una librería que el agente no conoce
bien, o cuya API ha cambiado. En vez de improvisar, consulta.

**Sin ella.** El agente tira de lo que sabe, con el riesgo de usar una API que ya
no existe. Es la integración que más previene errores silenciosos.

**Flag:** se configura durante `install`; la clave va a
`~/.config/opencode-secrets/context7-api-key`.

## Engram

**Qué aporta.** Memoria persistente entre sesiones: decisiones, convenciones y
hallazgos que sobreviven al cierre de la conversación.

**Cuándo se usa.** Es un cuaderno del coordinador, no del flujo. Los subagentes
no la invocan.

**Sin ella.** El contexto del proyecto sale de `EIN.md` y de los artefactos
OpenSpec, que son el registro canónico de todas formas. Engram no los sustituye.

**Flag:** `--no-engram`. Vive en `~/.engram-pi`.

## Linear

**Qué aporta.** Sincronización con un tablero: issues, estados, comentarios.

**Cuándo se usa.** Solo en modo equipo. En modo individual —el de por defecto—
el tablero es `openspec/changes/` más git, y la integración queda dormida.

**Sin ella.** No cambia nada salvo que trabajes con un tablero de equipo.

**Flag:** `--no-linear`. Clave en
`~/.config/opencode-secrets/linear-api-key`.

## Codegraph

**Qué aporta.** Un grafo del código preindexado: quién llama a qué, dónde se
define un símbolo, qué se rompe si cambia.

**Cuándo se usa.** En la fase de exploración. Una consulta al grafo sustituye
una decena de búsquedas y lecturas, lo que ahorra contexto además de tiempo.

**Sin ella.** La exploración se hace con búsqueda y lectura de ficheros.
Funciona, gasta más presupuesto.

**Flag:** `--no-codegraph`.

## Hypa

**Qué aporta.** Capacidades adicionales de análisis.

**Cuándo se usa.** Puntualmente, y no forma parte del flujo SDD.

**Sin ella.** Nada del flujo depende de esto.

**Flag:** `--no-hypa`.

## Instalar sin ninguna

```bash
ein install --runtime pi --no-engram --no-linear --no-codegraph --no-hypa --no-secrets
```

Instalación mínima: el núcleo, los agentes de fase y el flujo SDD. Es una
configuración perfectamente válida, y la más fácil de diagnosticar cuando algo
falla.

## Añadirlas después

Vuelve a ejecutar `ein install` sin el flag correspondiente. El instalador
detecta lo que ya está y añade lo que falte, con backup previo.

## Siguiente

[Troubleshooting](/ein-agent/05-debug/troubleshooting/) — cuando algo no
funciona.
