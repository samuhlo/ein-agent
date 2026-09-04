status: complete
change: reconcile-pi-host-tree-on-update
work_groups: 1
verification_status: pass

## // 000. RESUMEN

Instalar el host Pi desde npm latest ya no basta para declarar éxito: un manifiesto global antiguo de Bun puede conservar paquetes internos `@earendil-works/*` como dependencias directas fuera del rango que exige el host nuevo. El instalador ahora inspecciona ese árbol, actualiza únicamente los paquetes internos que fallan y vuelve a inspeccionarlo. Si la segunda lectura no es coherente, instalación y update fallan de forma explícita.

## // 001. QUÉ CAMBIÓ

- `installer/src/core/deps.ts` añade la reconciliación posterior a la instalación del host tanto para el destino canónico como para una copia Bun redirigida ya existente.
- La reparación construye argv sin shell y solo admite nombres bajo `@earendil-works/`; no incluye paquetes globales ajenos.
- El éxito de `bun install` no se toma como prueba: `evaluatePiHostTree` vuelve a leer los manifiestos del mismo `node_modules` y debe devolver `coherent: true`.
- `tests/deps-pi.test.ts` reproduce el salto `0.78.0 → 0.85.0`, la persistencia del fallo después de reparar y la copia Bun heredada.
- `openspec/specs/installer-runtime-coherence/spec.md` fija el comportamiento como contrato canónico.

## // 002. CÓMO FUNCIONA POR DENTRO

Después de verificar que el binario canónico coincide exactamente con el `latest` publicado, `installPi` evalúa el árbol del host en `<globalDir>/node_modules`. Si está sano, no ejecuta nada adicional. Si falla, deduplica y ordena los nombres de paquete señalados por el inspector, rechaza cualquier nombre fuera de la familia permitida y ejecuta una sola instalación global acotada con esos paquetes a `latest`. Después repite la misma inspección offline. Una copia Bun heredada recibe el mismo ciclo dentro de su propio `globalDir`, sin mezclar raíces.

## // 003. DECISIONES

- Reparación dirigida, no `bun update -g --latest`: el comando general también actualizaría herramientas globales propiedad del usuario.
- Segunda inspección obligatoria: un proceso con código cero no demuestra que el resolved tree satisfaga los rangos del host.
- Un solo intento: si npm publica una familia temporalmente incompatible o el manifiesto usa un rango no comprendido, Ein muestra la evidencia restante y para; no entra en un bucle ni oculta un fallback.
- Se conserva la separación de responsabilidades: el doctor sigue siendo solo lectura; la mutación pertenece exclusivamente a install/update.

## // 004. VERIFICACIÓN

- RED confirmado: los dos casos nuevos fallaban porque `installPi` hacía una sola llamada y declaraba éxito sin inspeccionar.
- `bun test tests/deps-pi.test.ts tests/pi-host-tree.test.ts` → 36 pass, 0 fail.
- `bun test` → 3113 pass, 0 fail, 237 ficheros.
- `bun run typecheck` → pass.
- `cd installer && bun run typecheck` → pass.
- verify: `bun test tests/deps-pi.test.ts tests/pi-host-tree.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`

## // 005. RIESGOS

- La reparación usa `latest` porque esa es la política explícita de Ein. Si upstream publica versiones incompatibles entre sí, la segunda inspección bloqueará el update en vez de declarar un runtime utilizable.
- Rangos distintos de exacto o caret siguen tratándose como desconocidos por el inspector estrecho. La reparación puede intentarse una vez, pero nunca convierte un rango no comprendido en verde.
- La llamada real a npm se cubre en el E2E de release; los tests de esta unidad inyectan el runner y el árbol para demostrar el orden y el fail-closed sin mutar la instalación del desarrollador.
