# ADR 0004 — Cerrar la fase arquitectónica

status: accepted
date: 2026-09-02

## Contexto

La fase 7 debía revisar los antiguos hotspots después de reparar el presupuesto
de revisión y construir un núcleo SDD compartido real. Su criterio no era hacer
pequeños todos los ficheros, sino dar un dueño claro a cada responsabilidad y
evitar que un cambio exigiera comprender media casa.

La medición final encuentra este estado:

- `project-state.ts` tiene 67 líneas y compone lectores separados para contrato,
  Git, OpenSpec, configuración Ein, runtimes y verificación;
- `runtime-session-adapters.ts` conserva el contrato público y la coordinación
  de peticiones, mientras identidad, plan de lanzamiento, ejecución y metadatos
  tienen módulos propietarios;
- `ein-ai.ts` tiene 63 líneas y solo ensambla los dueños de hooks, herramientas
  y comandos; no registra directamente eventos ni superficies;
- los cinco puentes SDD supervivientes son capacidades de runtime, no piezas de
  dominio pendientes, y cada uno declara motivo, dueño y condición de retirada
  en `shared/README.md`;
- `installer/src/cli/install.ts` sigue concentrando el cableado del ciclo de
  vida, pero todavía no existe evidencia de la matriz de beta que identifique
  una costura estable cuyo coste compense otro refactor.

Los recuentos no son criterios de aceptación. Sirven para reconocer las piezas;
la decisión se toma por responsabilidad y consumidores mecánicos.

## Decisión

Cerrar la fase arquitectónica. `project-state.ts`,
`runtime-session-adapters.ts` y `ein-ai.ts` ya tienen fronteras suficientes para
el objetivo de beta y no se dividen más sin un fallo concreto.

La extensión principal de Pi queda protegida como raíz de composición: puede
crear dependencias y registrar dueños especializados, pero los hooks, comandos
y herramientas viven en esos dueños. La suite comprueba que la fachada no use
directamente `pi.on`, `pi.registerCommand` ni `pi.registerTool`.

El posible corte de `installer/src/cli/install.ts` pasa a la fase 8. Solo se
abre si los escenarios de instalación, update, rollback o uninstall muestran
que más de un dueño cambia o falla conjuntamente. La evidencia deberá nombrar
la costura; el tamaño del fichero no basta.

`ein-linear.ts` y `model-config.ts` permanecen fuera: no existe evidencia de
responsabilidad mezclada que justifique moverlos.

## Consecuencias

- El siguiente trabajo principal es validar y cerrar la beta, no seguir
  reformando la arquitectura.
- Una fachada puede crecer al cablear un dueño nuevo, pero no recuperar la
  implementación de ese dueño.
- Los cinco puentes SDD no forman una cuenta atrás hacia cero. Se retira cada
  uno únicamente cuando se cumple su condición documentada.
- Si la matriz de beta descubre una costura del instalador, el refactor será una
  corrección guiada por ese caso y se verificará con el mismo escenario.

## Condiciones de retirada

- Reabrir la fase si una responsabilidad vuelve a no tener dueño, una frontera
  instalada difiere del checkout o un cambio ordinario exige modificar varios
  dueños sin relación.
- Sustituir la regla de composición de `ein-ai.ts` solo mediante una decisión
  que conserve una frontera mecánicamente comprobable.
- Retirar el aplazamiento del instalador cuando la fase 8 aporte la evidencia
  de ciclo de vida descrita arriba.
