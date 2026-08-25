## // 000. RESUMEN
El estilo llega ya a los dos runtimes: donde Claude tenía una frase, ahora tiene las mismas 2 KB de reglas que Pi. Y por el camino la suite evitó un despliegue roto. 2564 verde.

## // 001. QUÉ CAMBIÓ
- `cc-ein/sync.ts`: compila el contrato de estilo y lo materializa en `sdd-apply` y en el coordinador.
- `cc-ein/CLAUDE.md`: regenerado desde sus fuentes (10.492 → 12.563 bytes).
- `installer/src/core/cc-payload-inventory.ts` y `cc-payload.ts`: `CC_EIN_STYLE_CONTRACT` declarado en el payload y entre las rutas exigidas.
- `tests/style-parity-claude.test.ts` (nuevo) y los dos contratos de inventario actualizados.

## // 002. CÓMO FUNCIONA POR DENTRO
En Pi el bloque se inyecta en cada turno leyendo las skills del home instalado. Claude no tiene ese mecanismo: sus agentes son ficheros markdown que despliega `sync.ts`. Así que aquí el bloque se **materializa** al sincronizar y queda congelado hasta el siguiente sync.

Esa diferencia es real y no se esconde: un test compara lo materializado con lo que la skill dice **en ese momento**. Si alguien edita la skill y no vuelve a sincronizar, el test cae. Sin eso, Claude trabajaría con reglas viejas sin que nada lo dijera — que es la misma avería silenciosa que este programa lleva persiguiendo.

El coordinador también lo lleva, y no por simetría: la política dice que el padre delega el código a `sdd-apply`, pero la práctica dice otra cosa. El bloque va donde el código se escribe de verdad.

## // 003. DECISIONES
- Materializado en el sync, con la diferencia escrita en el código y en el contrato.
- Si el contrato de estilo no compila, **falla el sync**. Desplegar una superficie sin estilo es exactamente el fallo silencioso que esta unidad existe para quitar.
- `STYLE_CONSUMERS` es una lista de uno, escrita como lista: quien carga con 2 KB se declara, no se adivina.

## // 004. VERIFICACIÓN
`bun test`: 2564 pass, 0 fail (baseline 2560). Ambos typechecks en verde. TDD estricto en los dos grupos.

**Lo que la suite atrapó:** al importar el compilador desde `sync.ts`, ese módulo no viajaba en el payload de Claude —sus raíces son `cc-ein` y `ein-pi/core`, y `ein-pi/agent/lib/` no está en ninguna—. El test del payload empaquetado falló con `Cannot find module` desde el sync staged. Traducido: la sincronización habría reventado en la máquina del usuario con todos los tests unitarios en verde. El comentario del propio inventario ya lo avisaba.

## // 005. PENDIENTE / RIESGOS
- El coordinador crece 2 KB y se carga en todas las sesiones, también en las que no escriben código. Asumido: la alternativa es el puntero que no funcionaba.
- El congelado solo se detecta donde corre la suite.
- Hay que regenerar el bundle del template tras tocar algo que el payload transporta: `bun test` no lo reconstruye y el smoke compara bytes desplegados.
