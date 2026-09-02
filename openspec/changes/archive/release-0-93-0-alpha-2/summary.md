## // 000. RESUMEN

La `0.93.0-alpha.2` corrige la instalación de Pi en entornos como Omarchy,
donde la configuración global de Bun puede apuntar fuera de `~/.bun/bin`.

## // 001. QUÉ CAMBIÓ

- La instalación del Pi administrado fija explícitamente sus directorios global
  y de binarios bajo `~/.bun`.
- El instalador lee la versión del binario canónico después de instalar y falla
  de forma inmediata y honesta si no es la requerida.
- Los fallos de herramientas opcionales se muestran como avisos sin bloquear la
  instalación ni presentarse como éxitos.
- La matriz Docker incluye un escenario que reproduce la redirección global de
  Bun observada en Omarchy.

## // 002. VERIFICACIÓN

- Tests unitarios del destino, read-back de versión y progreso con avisos.
- E2E Docker con Pi `0.84.4` preexistente, globales redirigidos, reparación a
  `0.84.3`, reinstalación idempotente y `doctor` sin fallos.
- El smoke post-publicación actualiza desde `installer-v0.93.0-alpha.1`.

## // 003. RIESGO RESIDUAL

Ein trata `~/.bun/bin/pi` como runtime propio y deliberadamente ignora para ese
paquete las redirecciones globales de Bun definidas por el usuario. El resto de
instalaciones Bun del sistema conserva su configuración.
