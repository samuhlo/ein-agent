---
change: beta-phase-zero-baseline
phase: design
created: 2026-08-28T00:00:00Z
lane: standard
tdd: strict
spec_delta: none
---

# Design — beta phase zero baseline

## A. Proposal

### Política de modelos y proveedores

La plantilla distribuida queda neutral: no incluye `defaultProvider`, `defaultModel` ni `enabledModels`. Esto no convierte esos campos en inválidos. Son estado del usuario y las rutas de merge/actualización deben preservarlos. `/ein:models` continúa siendo la única superficie de Ein que escribe una elección explícita.

El instalador conserva el wizard opcional de integraciones. Context7 se ofrece siempre en modo interactivo y Linear solo cuando la integración está activa. MiniMax deja de formar parte de esa lista implícita. Se inyecta la operación de solicitud de secreto como efecto para verificar los nombres realmente solicitados sin abrir UI.

### Recomendación de esfuerzo

`AGENT_EFFORT_RECOMMENDATIONS` contiene solo `thinking` y `reason`. No expresa calidad, precio, proveedor ni nombre de modelo.

La distancia usa el orden `off, minimal, low, medium, high, xhigh`. `isEffortRecommendationGapLarge(actual, recomendado)` devuelve `false` al heredar, al coincidir o al separarse un único nivel, y `true` desde dos niveles. El panel usa esa misma función tanto para el marcador de fila como para el detalle enfocado.

### Baseline arquitectónico

Un test recorre los ficheros TypeScript de producción de `ein-cc`, `installer/src` e `installer/scripts` con el AST de TypeScript. Recoge literales que contengan `ein-pi/agent` y los compara con una lista fija de deuda conocida. La igualdad exacta obliga a reducir conscientemente el baseline cuando la fase 1 extraiga un core y bloquea cualquier reach-in nuevo.

## B. Spec

- R1: el bundle no selecciona proveedor, modelo ni allowlist.
- R2: el installer no promociona un proveedor mediante sus prompts opcionales.
- R3: las recomendaciones contienen solo esfuerzo y motivo.
- R4: solo una distancia de dos o más niveles genera alerta.
- R5: no aparece ningún reach-in nuevo desde los adaptadores al runtime de Pi.

## Verificación

1. RED: contratos nuevos fallan por defaults de plantilla, prompt MiniMax, tiers y ausencia del guardián.
2. GREEN: cambios mínimos en las cuatro superficies.
3. REFACTOR: eliminar nombres/comentarios obsoletos tocados.
4. Ejecutar pruebas focales, suite completa, ambos typechecks y construcción del bundle host.
