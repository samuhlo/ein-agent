---
change: beta-phase-zero-baseline
phase: scope
created: 2026-08-28T00:00:00Z
---

# Scope — beta phase zero baseline

## Objetivo

Cerrar la política previa a la beta antes de reestructurar carpetas:

1. La plantilla y el instalador no eligen ni promocionan un proveedor o modelo.
2. Las elecciones explícitas que ya haya hecho el usuario se conservan al actualizar.
3. `/ein:models` recomienda únicamente esfuerzo y solo alerta ante diferencias grandes.
4. El bundle final demuestra la misma política que el árbol fuente.
5. Los accesos actuales de `installer` y `ein-cc` a `ein-pi/agent` quedan inventariados para que no crezcan antes de la fase arquitectónica.

## Dentro

- Retirar `defaultProvider`, `defaultModel` y `enabledModels` de la plantilla fuente.
- Retirar el prompt implícito de credenciales de MiniMax del flujo normal de instalación.
- Mantener la escritura explícita de modelo desde `/ein:models` y la preservación de settings del usuario.
- Sustituir recomendaciones barato/capaz por recomendaciones de esfuerzo.
- Considerar grande una distancia de al menos dos posiciones en `off → minimal → low → medium → high → xhigh`.
- Añadir contratos sobre el bundle desplegable y sobre dependencias entre adaptadores/runtime.

## Fuera

- Mover carpetas o extraer todavía un core compartido.
- Eliminar el soporte genérico para guardar secretos o modelos que el usuario elija explícitamente.
- Crear o priorizar un perfil `minimal`.
- Cambiar los defaults operativos de esfuerzo de `sdd-apply`, `sdd-map` o `sdd-verify`.
- Tocar otros cambios activos de OpenSpec.

## Criterios de aceptación

- Un bundle nuevo no contiene selección de proveedor/modelo ni allowlist de modelos.
- Una instalación interactiva solicita Context7 y Linear cuando corresponde, nunca MiniMax de forma implícita.
- Las recomendaciones no contienen `tier`, proveedor ni modelo.
- Una desviación adyacente no genera `!`; `low ↔ high` sí.
- Cualquier nuevo literal de producción desde `installer` o `ein-cc` hacia `ein-pi/agent` rompe el guardián de arquitectura.

## Spec delta declaration
spec_delta: none
spec_delta_reason: Política de plantilla, UI y límites internos; no cambia el protocolo SDD canónico.
