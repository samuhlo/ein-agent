status: complete
change: pi-payload-overlay-closure
work_groups: 3
verification_status: pass

## // 000. RESUMEN

El template instalado de Pi conserva las composiciones específicas del runtime y demuestra que todo su grafo TypeScript enlaza antes de publicar el archive. El cierre compartido deja de impedir que Ein arranque fuera del checkout.

## // 001. QUÉ CAMBIA

- Separa la fachada compartida de readiness de su composición Pi bajo `sdd-close-readiness-runtime.ts`.
- Añade fachadas puras para el motor y la compactación de cierre.
- Enruta cierre e identidad Git exclusivamente mediante paths locales que existen tanto en el checkout como en el paquete.
- Exige una fachada pura por módulo compartido y rechaza TypeScript anidado en el overlay plano.
- Resuelve imports relativos de valor y tipo y compila los entrypoints Pi desde el staging real.
- Restaura el motivo operativo del escritor determinista de `summary.md`.

## // 002. CÓMO FUNCIONA POR DENTRO

El checkout usa fachadas homónimas para alcanzar `shared/`; el overlay las sustituye byte a byte por la implementación. Las composiciones Pi sobreviven porque usan nombres `-runtime`. Después de copiar y reescribir dependencias, el bundler recorre todo TypeScript staged, impide escapes, comprueba cada destino y ejecuta un build sin resolver paquetes externos para validar también los exports desde los entrypoints reales.

## // 003. DECISIONES

- La pureza de fachada se valida con el AST, no con un comentario convencional.
- La puerta de grafo incluye `import type` y `export type`; el build de entrypoints cubre los símbolos de valor.
- Los subdirectorios fallan explícitamente: soportarlos requeriría cambiar el contrato de layout plano.
- La compactación recibe fachada aunque el estado final la alcance transitivamente, para que el contrato sea total y los escalones históricos puedan componerse por rutas instalables.

## // 004. VERIFICACIÓN

- `bun test tests/pi-payload-closure.test.ts tests/architecture-boundaries.test.ts --timeout 15000`: 17 pass, 0 fail.
- `bun test --timeout 15000`: 2.979 pass, 0 fail, 220 ficheros en 84,68 s.
- `bun run typecheck` en raíz e `installer/`: ambos limpios.
- `bun run bundle-template:host`: archive real generado; el payload extraído contiene 142 fuentes TypeScript, cero rutas al `shared/` del checkout, la composición `sdd-close-readiness-runtime.ts` y todos sus entrypoints enlazan.
- El cierre completo de Claude permanece en 74 ficheros, 17 de `shared/sdd/` y ninguno de `ein-pi/agent/lib/sdd-close*`.

## // 005. RIESGOS

- El build del template hace más trabajo, pero opera sobre un payload acotado y evita publicar un runtime que solo funciona desde el checkout.
- El overlay continúa siendo destructivo; la correspondencia total de fachadas y la compilación staged convierten esa propiedad en un contrato comprobado.
