# 01 · Un único resultado de verificación

Estado: diseño listo para ejecutar; no implementado.
Base auditada: `3b9fa420f8cd18480bee6a19dd1ed14b99bc483e` (alpha.9).
Dependencias: ninguna; 02 consume su API. Ejecutar sobre main actualizado y limpio.
Manifiesto: //002, //006 y //007.

## A. Proposal

Un ejemplo que diga «result: pass» no puede convertir en éxito un informe cuyo
resultado global es `status: fail`. Hoy puede hacerlo y permitir el archivo.
Se sustituirán las expresiones regulares divergentes por un parser compartido.

El cambio cubre lectura del resultado, lint y lectura de comandos del informe.
No ejecuta verificaciones, no demuestra cobertura y no introduce frescura:
la identidad de lo verificado corresponde al plan 02.

Anclas de lectura:

- `shared/sdd/sdd-routing-core.ts`: `readVerifyOutcome`, `readSddCompletionEvidence`.
- `shared/sdd/sdd-artifact-validation.ts`: `PHASE_REQUIRED`, `lintPhaseArtifact`.
- `shared/sdd/sdd-summary-write.ts`: `writeVerifiedSddSummary`, variable `recorded`.
- `shared/sdd/sdd-close-readiness.ts`: `createAssessCloseReadiness`.
- `runtime/agents/sdd-verify.md`: secciones Report y Behavioral coverage.
- `tests/sdd-router.test.ts`, `tests/sdd-close.test.ts` y `tests/sdd-reconcile.test.ts`.

Riesgo: informes antiguos con el estado escondido dentro de prosa dejarán de
contar como éxito. Es una degradación explícita, no un fallo de implementación.
La compatibilidad admitida se define abajo y no se ampliará mediante heurísticas.

## B. Spec

1. El sistema MUST distinguir metadatos globales de ejemplos, citas y tablas.
   Given un ejemplo `Example expected result: pass` seguido de `status: fail`,
   When se consulta o cierra el cambio, Then el resultado es fail y no se archiva.
2. Un resultado ambiguo o ilegible MUST NOT producir pass.
   Given dos declaraciones globales contradictorias, When se analiza el informe,
   Then un fallo explícito prevalece; sin fallo pero con duplicados, será unknown.
3. Un check obligatorio fallido, desconocido o malformado MUST impedir pass.
   Given `required_check` con salida distinta de cero o `null`, When hay también
   `status: pass`, Then el resultado efectivo es fail con diagnóstico del check.
4. La cobertura parcial o inexistente MUST impedir pass.
   Given `behavior_coverage: partial|none`, When el estado declara pass,
   Then el resultado es fail; `verified|n-a` no sustituyen al estado global.
5. Los lectores MUST compartir la decisión.
   Given el mismo contenido, When lo leen router, lint y escritor del resumen,
   Then ninguno obtiene pass si el parser devuelve fail o unknown.
6. Un informe correcto MUST seguir funcionando.
   Given un estado único y checks correctos, When existen palabras «failed»
   dentro de una explicación histórica o un bloque de código, Then conserva pass.

## C. Decisions

Crear `shared/sdd/sdd-verification-outcome.ts`, sin acceso al filesystem.
Exportar `parseVerificationReport(content: string): VerificationReportParse`:

```ts
type VerificationReportParse = {
  outcome: "pass" | "fail" | "unknown";
  status: "pass" | "fail" | null;
  coverage: "verified" | "partial" | "none" | "n-a" | null;
  requiredChecks: { command: string; exitCode: number | null }[];
  issues: { code: string; line: number; message: string }[];
};
```

Gramática cerrada:

- Normalizar CRLF, no el contenido de comandos.
- Aceptar blancos y un título inicial `# ...`; después, el preámbulo global
  termina al primer encabezado Markdown posterior. No interpretar frontmatter YAML.
- Leer estado solo en líneas completas del preámbulo: `status|result|resultado`
  y `:` o `=`. Compatibilidad de valores: `pass|passed|ok|pasa` y
  `fail|failed|falla`, sin distinguir mayúsculas. El productor seguirá emitiendo
  exclusivamente `status: pass|fail`.
- No leer campos dentro de fences de backticks o tildes, blockquotes, listas ni
  tablas. La máquina de fences exige cierre del mismo carácter y longitud suficiente.
- Leer `behavior_coverage` global con la misma frontera. Ausente conserva el
  modo legacy con issue informativo; valor inválido o repetido impide pass.
- Leer `required_check: <JSON>` fuera de fences en todo el informe, admitiendo
  únicamente el prefijo opcional de lista que ya acepta el runtime. Validar
  objeto, comando no vacío y `exitCode` entero o null. No recortar caracteres
  internos ni reinterpretar comandos. Un JSON roto se registra como fallo.
- Precedencia: check obligatorio no satisfactorio, cobertura insuficiente o
  declaración global fail ⇒ fail; metadatos ambiguos/ausentes ⇒ unknown;
  una declaración pass única con el resto válido ⇒ pass.
- Dos pass idénticos son unknown con `duplicate-status`, no selección del primero.
  Texto que contenga «fail» sin campo global no es por sí solo un veredicto.

Crear fachada `ein-pi/agent/lib/sdd-verification-outcome.ts`, siguiendo el overlay
plano de `installer/scripts/bundle-template.ts`; no duplicar el parser en Pi.

`readVerifyOutcome` conserva `absent` cuando no existe el fichero; si existe,
devuelve exclusivamente `parseVerificationReport(...).outcome`.
`lintPhaseArtifact("verify")` usa el parser para señalar unknown como error
de contrato; fail correctamente declarado es un informe válido cuyo resultado
impide cierre. No convertir todos los fallos funcionales en errores de sintaxis.

`writeVerifiedSddSummary` conserva su comprobación de ciclo de vida; obtiene
`requiredChecks` del parser, sin volver a hacer JSON.parse de líneas por su cuenta.
Se mantienen las formas legacy de listar comandos para resúmenes; no se las
presenta como prueba de ejecución real.

Migración: no reescribir informes al leerlos. Un informe ambiguo muestra su
diagnóstico concreto; si falta evidencia se re-verifica, no se cambia fail a pass.
Rollback: revertir el commit del parser y sus conexiones; no hay migración de disco.
No publicar un rollback que restablezca cierre inseguro sin decisión del usuario.

## D. Acceptance

Matriz mínima: ejemplo anterior al fallo, pass y fail duplicados, dos pass,
fences anidados por longitud, blockquote, resultado histórico en tabla, sin estado,
alias legacy global, cobertura partial/none, check nulo/no cero/JSON roto y pass sano.

La prueba de cierre MUST invocar `closeChange` en un fixture temporal y comprobar
que no crea `archive/<change>` para todos los casos de fallo o incertidumbre.
El control positivo MUST archivar un informe único válido en la versión previa a 02;
tras 02, debe crear también el recibo vigente definido allí.

La prueba de reconciliación MUST demostrar que un informe con falso pass anterior
no rescata una fase verify fallida. No reproducir únicamente la regex en el test.

## E. Execution packets

### 01A · Parser y consumidores primarios

- read: anclas A; `installer/scripts/pi-payload-validation.ts` para la fachada.
- edit: `shared/sdd/sdd-verification-outcome.ts` (nuevo),
  `ein-pi/agent/lib/sdd-verification-outcome.ts` (nuevo),
  `shared/sdd/sdd-routing-core.ts`, `shared/sdd/sdd-artifact-validation.ts`.
- tests: crear `tests/sdd-verification-outcome.test.ts`; ampliar
  `tests/sdd-router.test.ts` y `tests/sdd-close.test.ts` con la matriz anterior.
- steps: fijar primero casos negativos; implementar gramática y precedencia;
  sustituir exclusivamente los lectores de verify; conservar apply y sus estados.
- verify: `bun test tests/sdd-verification-outcome.test.ts tests/sdd-router.test.ts tests/sdd-close.test.ts`
- verify: `bun run typecheck`
- stop: todos los casos pasan y ninguna ruta mantiene una segunda regex de verdict.

### 01B · Resumen, reconciliación y empaquetado

- read: `writeVerifiedSddSummary`, `reconcilePhaseFailure`, overlay compartido.
- edit: `shared/sdd/sdd-summary-write.ts`.
- tests: ampliar `tests/sdd-reconcile.test.ts`, `tests/sdd-close.test.ts` y
  `tests/template-agent-inventory.test.ts` solo si necesita declarar la fachada.
- steps: compartir checks parseados; probar rechazo aguas abajo y control positivo;
  comprobar que el overlay resuelve el import en el payload instalado.
- verify: `bun test tests/sdd-verification-outcome.test.ts tests/sdd-router.test.ts tests/sdd-close.test.ts tests/sdd-reconcile.test.ts tests/template-agent-inventory.test.ts`
- verify: `bun run typecheck`
- stop: un único parser gobierna los tres consumidores; entregar diff y resultados.

No abrir otra fase para corregir redacción. Si main ha cambiado los contratos
nombrados o falta un consumidor descrito, devolver el conflicto concreto al padre;
el ejecutor no ampliará arquitectura, compatibilidad ni permisos.
