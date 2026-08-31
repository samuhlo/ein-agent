status: complete
change: sdd-close-recovery
work_groups: 1
verification_status: pass

## // 000. RESUMEN

El cierre SDD ya puede recuperarse si la limpieza final se interrumpe. El resultado duradero no cambia: cuando termina, `archive/<change>/` contiene únicamente `summary.md`.

## // 001. QUÉ CAMBIÓ

- La compactación mueve primero el directorio completo al archivo mediante un rename local.
- Una marca temporal versionada conserva el nombre del cambio, el hash del resumen y la clase de cierre.
- La poda elimina la documentación de proceso y retira la marca solo al terminar.
- Un reintento reconoce el trabajo pendiente, valida su procedencia y continúa.
- Las pruebas cubren cierre normal, interrupción, colisión ajena, legacy y reconciliación.

## // 002. CÓMO FUNCIONA POR DENTRO

Antes de mover el cambio se calcula el SHA-256 de `summary.md` y se escribe una marca dentro del directorio activo. El rename coloca juntos el resumen, la evidencia de proceso y esa marca en `archive/`. La poda conserva el resumen, borra el resto y elimina la marca en último lugar.

Si el proceso se corta, el siguiente cierre solo adopta el destino cuando la marca tiene la versión, el nombre y el hash esperados. Después retoma la poda. Un destino sin marca válida sigue siendo una colisión y no se toca.

## // 003. DECISIONES

- Se usa un rename entre carpetas hermanas para evitar el estado ambiguo con origen y archivo simultáneos.
- La marca es temporal: sirve para recuperar, no amplía el historial permanente.
- El recibo del cierre viaja en la marca para que legacy y reconciliación no pierdan su procedencia al reintentarse.
- El seam de fallo existe solo en tests y no altera las opciones públicas de cierre.

## // 004. VERIFICACIÓN

- `bun test`: 2904 pass, 0 fail, 209 ficheros.
- Tests focalizados posteriores al cierre: 66 pass, 0 fail.
- Typecheck raíz e instalador: pass.
- Lint SDD: 0 errores, 0 avisos.
- Producción: 195 líneas cambiadas, dentro del presupuesto de revisión de 400.
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`

## // 005. PENDIENTE / RIESGOS

- El rename atómico presupone el layout soportado: el cambio activo y `archive/` viven bajo la misma raíz de cambios.
- La siguiente mejora arquitectónica queda fuera de esta PR: hacer legible el diario transaccional del instalador sin cambiar su comportamiento.
