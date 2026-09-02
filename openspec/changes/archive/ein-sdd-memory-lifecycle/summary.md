## // 000. RESUMEN

La memoria opcional de SDD deja de ser estado privado de `ein-ai.ts`. Un módulo explícito posee las instancias por sesión y las dos escrituras permitidas: después de validar una fase y después de archivar un cambio.

## // 001. QUÉ CAMBIÓ

- `ein-sdd-memory.ts`: administra el ciclo de vida Engram y degrada todos los fallos a recibos honestos.
- `ein-ai.ts`: consume cuatro funciones del nuevo dueño y elimina sus copias locales.
- Un test fija la forma de un recibo omitido y comprueba que la fachada ya no define la política.

## // 002. CÓMO FUNCIONA POR DENTRO

Cada sesión reutiliza una única instancia de memoria, salvo que el runtime inyecte una. Guardar sigue condicionado por configuración, artefacto limpio y candidato válido. OpenSpec continúa siendo el registro canónico: cualquier fallo de memoria produce un recibo `skipped` o `failed`, nunca impide cerrar el flujo principal.

## // 003. DECISIONES

- Extraer la dependencia compartida antes de mover check y close.
- Mantener preparación y guardado juntos porque comparten instancia, configuración y caché de sesión.
- No exponer el transporte: los consumidores reciben operaciones de ciclo de vida, no detalles de Engram.

## // 004. VERIFICACIÓN

- 80 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

Check y close todavía viven en la fachada, aunque ya dependen de una frontera nominal. La PR siguiente podrá moverlos sin una bolsa de callbacks anónimos.
