# Roadmap: codegraph, TDD y launcher de Ein

Hoja de ruta de esta semana para reducir verificaciones redundantes, integrar la inicialización de codegraph y hacer del launcher de Ein un punto de entrada más útil sin romper sus interfaces existentes.

## Orden de entrega

1. **`optimize-tdd-verify`** — optimizar la verificación TDD sin debilitar el cierre independiente.
2. **`bootstrap-codegraph`** — integrar en Ein una inicialización explícita y segura del índice.
3. **`unify-ein-launcher`** — ampliar el menú existente de `ein` y conservar la compatibilidad.

Cada slice tendrá su propio ciclo de SDD y su propia unidad de revisión.

## 1. `optimize-tdd-verify`

**Orden estimado esta semana:** primera entrega.

### Valor para el usuario

Menos comandos repetidos y un ciclo TDD más rápido, manteniendo la confianza del cierre independiente.

### Alcance

- Eliminar comandos de verificación redundantes sin debilitar el cierre independiente.
- Mantener en `apply` los tests enfocados de RED/GREEN.
- Hacer que `verify` valide la evidencia TDD, deduplique comandos finales idénticos, vuelva a ejecutar un comando final enfocado por cada seam de comportamiento y ejecute después una sola vez las comprobaciones globales relevantes.
- No introducir complejidad de caché de resultados en este slice.

### No objetivos

- No reducir ni sustituir la validación independiente del cierre.
- No introducir una caché de resultados.
- No convertir `apply` en una ejecución de comprobaciones globales.

### Criterios de aceptación

- [ ] La evidencia TDD se valida en `verify`.
- [ ] Los comandos finales idénticos se ejecutan una sola vez.
- [ ] Se ejecuta un comando final enfocado por seam de comportamiento.
- [ ] Las comprobaciones globales relevantes se ejecutan una sola vez.
- [ ] El cierre independiente conserva su cobertura.

### Dependencias y riesgos

- La separación entre el foco de `apply` y el cierre independiente de `verify` debe mantenerse explícita.
- El riesgo principal es deduplicar demasiado y perder una comprobación del cierre; la revisión debe comprobar esa frontera.

## 2. `bootstrap-codegraph`

**Orden estimado esta semana:** segunda entrega, después de `optimize-tdd-verify`.

### Valor para el usuario

Evitar que cada usuario tenga que recordar un comando de shell separado para preparar el índice de codegraph, sin inicializaciones inesperadas.

### Alcance

- Integrar en Ein la inicialización cuando falte el índice.
- Validar primero la idempotencia, el bloqueo y la salida de la CLI.
- Mantener en el MVP una inicialización segura, opt-in y explícita integrada en Ein.
- No inicializar silenciosamente hasta demostrar los semánticos de la CLI.

### No objetivos

- No exigir un comando separado que el usuario deba recordar para el MVP.
- No inicializar el índice silenciosamente antes de validar la CLI.
- No ampliar el slice a comportamientos no necesarios para esa inicialización.

### Criterios de aceptación

- [ ] La CLI demuestra comportamiento idempotente.
- [ ] La CLI deja claro cuándo bloquea y por qué.
- [ ] La salida de la CLI es suficiente para que Ein pueda guiar la acción.
- [ ] La inicialización explícita está integrada en Ein.
- [ ] Ein no inicializa silenciosamente antes de validar los semánticos de la CLI.

### Dependencias y riesgos

- Depende de validar primero los semánticos de idempotencia, bloqueo y salida.
- El riesgo es ocultar una operación costosa o inesperada; el MVP debe conservar el opt-in y la explicitud.

## 3. `unify-ein-launcher`

**Orden estimado esta semana:** tercera entrega, después de `bootstrap-codegraph`.

### Valor para el usuario

Disponer de un único punto de entrada que muestre el estado útil del runtime y del proyecto y dirija a las operaciones existentes, sin perder los comandos automatizables.

### Alcance

- Evolucionar el menú sin argumentos existente de `ein` en `installer/src/main.ts` y `installer/src/cli/menu.ts`.
- No reescribir el menú.
- Añadir estado del runtime y del proyecto.
- Delegar en los mecanismos existentes de Pi, Claude, actualización y doctor.
- Preservar los comandos scriptables y los alias de compatibilidad.

### No objetivos

- No reemplazar ni duplicar los mecanismos existentes de Pi, Claude, actualización o doctor.
- No reescribir el menú sin argumentos.
- No romper comandos scriptables ni alias de compatibilidad.

### Criterios de aceptación

- [ ] El menú existente muestra el estado del runtime y del proyecto.
- [ ] El menú despacha a los mecanismos existentes de Pi, Claude, actualización y doctor.
- [ ] Los comandos scriptables siguen funcionando.
- [ ] Los alias de compatibilidad se conservan.
- [ ] La evolución se limita a los puntos de entrada existentes, sin reescritura del menú.

### Dependencias y riesgos

- Depende de los mecanismos existentes y de sus contratos de invocación.
- El riesgo principal es introducir una regresión en automatizaciones o alias; la revisión debe priorizar compatibilidad.

## Definición de hecho al final de la semana

- [ ] Los tres slices se han entregado en el orden acordado y cada uno tiene su propio ciclo de SDD y unidad de revisión.
- [ ] `optimize-tdd-verify` reduce duplicación sin debilitar el cierre independiente.
- [ ] `bootstrap-codegraph` integra una inicialización explícita y no silenciosa hasta validar la CLI.
- [ ] `unify-ein-launcher` amplía el menú existente y conserva comandos scriptables y alias de compatibilidad.
- [ ] Las decisiones y los límites de cada slice están reflejados en sus criterios de aceptación y revisados de forma independiente.
