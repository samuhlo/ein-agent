status: complete
change: pi-prelaunch-latest
work_groups: 4
verification_status: pass

## // 000. RESUMEN

`ein update` ya no acepta cualquier SemVer como prueba de Pi latest: después de instalar consulta el endpoint npm `/latest` y compara exactamente la versión esperada con el ejecutable canónico. El launcher `ein` ejecuta una vez por proceso `pi update --all --no-approve` antes del primer handoff Pi y entra inmediatamente en el runtime recién actualizado. El banner de sesión normaliza las versiones y elimina el `vv` duplicado.

## // 001. QUÉ CAMBIÓ

- `installer/src/core/deps.ts` resuelve evidencia npm latest fresca mediante una dependencia inyectable y falla de forma explícita ante red, respuesta malformada o divergencia expected/observed.
- `ein-pi/agent/lib/pi-prelaunch-update.ts` conserva la decisión pura: plan autenticado, argv cerrado, offline, memoización, fallback degradado y bloqueo.
- `terminal-app-entrypoint.ts` posee el proceso real y comparte un coordinador entre create/resume/continue. Claude y runtimes inyectados no lo ejecutan.
- `formatEinPiVersionTag` hace idempotente el prefijo de versiones concretas y deja `dev` sin prefijar.

## // 002. CÓMO FUNCIONA POR DENTRO

La instalación consulta npm después de que Bun resuelva `@latest` y exige igualdad exacta expected/observed. En el launcher, el coordinador consume un LaunchPlan autenticado y ejecuta argv cerrado, sin shell y con el hogar aislado. El binding SDD one-shot se elimina del proceso de mantenimiento y solo llega al hijo interactivo. Si el update falla, un probe acotado de versión decide entre degradar visiblemente o bloquear.

## // 003. DECISIONES

- La selección explícita de Pi autoriza el mantenimiento prearranque fijo; los comandos libres de la vista Sistema siguen requiriendo doble confirmación.
- `PI_OFFLINE` evita la actualización automática. Un fallo de red permite entrar solo si el host instalado supera un probe SemVer; el mensaje no afirma frescura de extensiones.
- La memoización dura un proceso del launcher: no introduce estado persistente ni una política temporal nueva.
- El adaptador normalizado de sesiones conserva su prohibición de actualizar; el efecto vive en el borde de terminal.

## // 004. VERIFICACIÓN

- verify: `bun test --timeout 15000`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `cd installer && bun run bundle-template:host`
- verify: `cd installer && bun run build:all -- darwin-arm64`
- Resultado: Strict TDD; 3.088 pruebas, 0 fallos, 14.892 expectativas; ambos typechecks, bundles, binario compilado y probe npm real `0.84.4` en pass.

## // 005. PENDIENTE / RIESGOS

- El primer handoff Pi de cada proceso espera una reconciliación de red salvo `PI_OFFLINE`.
- El fallback degradado prueba ejecutabilidad del host, no frescura de extensiones, y lo declara así.
- El build nativo de Bun puede dejar un temporal ignorado; la verificación retiró solo el fichero exacto generado y la higiene final pasó.
