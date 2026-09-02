status: complete
change: shared-sdd-change-validation-owner
work_groups: 2
verification_status: pass

## // 000. RESUMEN

La validación de cambios ya sale del núcleo compartido. Pi y Claude añaden únicamente la política de lane que les corresponde, y el puerto público deja de cruzar a la antigua implementación de Pi.

## // 001. QUÉ CAMBIA

- `sdd-guardrails.ts` queda como fachada compatible de Pi.
- `shared/ports/sdd.ts` compone el coordinador neutral directamente.
- La frontera autorizada baja de siete a seis puentes SDD.

## // 002. CÓMO FUNCIONA POR DENTRO

El coordinador recibe una función que traduce la ruta de un cambio a sus fases esperadas. Cada runtime conecta ahí su lector de lane sin trasladar persistencia al núcleo compartido.

## // 003. CÓMO PROBARLO

Pruebas de paridad, cierre de imports, frontera arquitectónica, suite completa, ambos typechecks, ambos paquetes y smoke compilado Claude.

- verify: `bun test && bun run typecheck && (cd installer && bun run typecheck && bun run bundle-template:host && bun run scripts/bundle-ein-cc.ts) && bun build installer/scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && (cd /tmp && /tmp/ein-cc-payload-smoke)`

## // 004. VERIFICACIÓN

2.967 pruebas pasan; typechecks, bundles y smoke compilado pasan.

## // 005. RIESGOS

La fachada histórica de validación todavía puede viajar de forma indirecta por `sdd-close.ts`. Desaparecerá del cierre cuando se retire ese puente; esta PR no adelanta esa responsabilidad.
