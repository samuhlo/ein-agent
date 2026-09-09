---
title: "Tooling opcional"
description: "Las integraciones que EIN puede usar, y qué pasa cuando no están."
sources: ["installer/src/core/engram.ts", "installer/src/core/secrets.ts", "installer/src/core/deps.ts", "ein-pi/agent/mcp.json"]
verified_rev: "405a6c1"
---

EIN funciona sin ninguna de estas. Las opciones del instalador conservan sus
flags; Headroom se configura desde Ein-Pi. Si una integración no está disponible,
la capacidad concreta queda inactiva y el flujo continúa.

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

**Flag:** `--no-engram`. Vive en `~/.engram-ein`.

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

## Headroom (Ein-Pi)

**Qué aporta.** Reduce resultados grandes de comandos antes de que los lea el
modelo. Ein comprueba que conserva todos los registros, valores, tipos y orden;
si no puede verificarlo, entrega la salida normal de Pi. Puede recuperar el
archivo completo que Pi guardó al recortar una salida.

**Control.** `/ein:headroom on|observe|off`. `observe` mide sin cambiar lo que recibe
el modelo. La preferencia vive en `.pi/ein/headroom.json`; un antiguo Hypa apagado
permanece apagado durante la transición. `/ein:hypa` explica el nuevo comando y
ya no envuelve comandos con el ejecutable de Hypa.

**Servicio local.** `/ein:headroom update 0.37.0` prepara una instalación aislada
(requiere `uv`) y la selecciona solo si pasa las pruebas de compatibilidad. La
versión 0.37.0 es la probada en esta entrega. `/ein:headroom start|stop|status`
controla el servicio; Ein interactivo inicia en segundo plano un binario ya
instalado. Los subagentes lo reutilizan. No se descargan dependencias al abrir
una sesión. `/ein:headroom rollback` vuelve a una versión gestionada anterior.

**Qué queda intacto.** Comandos, permisos, código, diffs, errores de ejecución y
contratos SDD. No cambia el proveedor ni su esfuerzo. Se admite un conjunto
verificado de tablas JSON y logs con prefijo temporal; no cualquier resumen.
El original queda recuperable con `read`, incluso al detener Headroom.

**Sin servicio.** Se conserva la salida de Pi. `status` informa de conexión,
versión, compresiones, originales completos y bytes. Esos bytes no equivalen
al ahorro de factura de una sesión.

## Hypa (compatibilidad del instalador)

El instalador conserva la opción histórica y `--no-hypa` mientras se decide la
oferta de dependencias. El binario puede usarse por separado, pero ya no es el
motor de compresión de Ein-Pi. Instalar Hypa no instala ni activa Headroom.

## Instalar sin ninguna

```bash
ein-install install --runtime pi --no-engram --no-linear --no-codegraph --no-hypa --no-secrets
```

Instalación mínima: el núcleo, los agentes de fase y el flujo SDD. Es una
configuración perfectamente válida, y la más fácil de diagnosticar cuando algo
falla.

## Añadirlas después

Vuelve a ejecutar `ein-install install` sin el flag correspondiente. El instalador
detecta lo que ya está y añade lo que falte, con backup previo.

## Siguiente

[Troubleshooting](/ein-agent/05-debug/troubleshooting/) — cuando algo no
funciona.
