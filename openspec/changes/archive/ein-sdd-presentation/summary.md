## // 000. RESUMEN

La presentación SDD deja de vivir dentro de la fachada `ein-ai.ts`. El formato de estado, auditoría y siguiente paso, junto con el parseo de argumentos de comando, tiene ahora un dueño pequeño y comprobable. No cambia ninguna decisión del flujo.

## // 001. QUÉ CAMBIÓ

- `ein-pi/agent/extensions/internal/ein-sdd-presentation.ts`: nuevo dueño de los formateadores y del parseo de `/ein:sdd-next`.
- `ein-pi/agent/extensions/ein-ai.ts`: importa esa superficie y pierde la copia local; también elimina un comentario duplicado.
- Los tests de salida importan el formateador real y los contratos estáticos buscan cada frase en su dueño actual.

## // 002. CÓMO FUNCIONA POR DENTRO

El módulo recibe resultados ya calculados por el router y los convierte en texto humano. Puede comprobar si existe el directorio de un cambio, pero no decide fases, no escribe estado y no ejecuta herramientas. La fachada conserva el cableado con Pi.

## // 003. DECISIONES

- Extraer una responsabilidad completa antes que mover registros de herramientas a ciegas.
- Mantener intactos los textos observables para no mezclar arquitectura con cambios de producto.
- Hacer que los tests importen la función real donde antes mantenían una réplica que podía divergir.

## // 004. VERIFICACIÓN

- 96 tests SDD enfocados: pass.
- Typecheck de raíz e instalador: pass.
- Presupuesto: 183 líneas y 7.659 bytes no blancos de producción; dentro del límite.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

La fachada sigue registrando las herramientas y comandos SDD. Este cambio solo hace visible la siguiente costura; los registros se separan en PRs posteriores.
