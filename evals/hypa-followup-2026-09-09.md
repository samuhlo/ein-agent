# Hypa: detección corregida y utilidad delimitada

Seguimiento breve del 2026-09-09. La PR #401 de Headroom queda **cerrada, conservando rama e historial**. Se mantiene Hypa como opción; esta evaluación no recomienda activarlo de forma general ni atribuye ahorro al flujo completo.

## Corrección

El proyecto tenía Hypa en `on`, pero el runtime no buscaba en PATH: `/opt/homebrew/bin/hypa` existía y `resolveHypaBin()` devolvía `undefined`. El resolvedor ahora respeta `HYPA_BIN`, consulta entradas absolutas de PATH y conserva los destinos históricos como alternativa. Rechaza directorios y archivos no ejecutables; cita las rutas con espacios al construir el comando.

El proveedor explícito del hijo también aplica Hypa después del control de seguridad. Esto evita que la opción desaparezca en foreground. `off` se respeta y la coexistencia de proveedores no envuelve el comando dos veces.

**`git diff` y `git show` dejan de comprimirse automáticamente.** La prueba encontró omisión de código modificado, no solamente de contexto repetido. Esos comandos conservan el manejo nativo de Pi y su referencia a la salida completa cuando se recorta. No se amplía el wrapper a Bun, JSON genérico ni comandos compuestos.

## Prueba acotada, sin nuevas ejecuciones de modelos

Hypa **0.1.14**, Pi **0.85.1**, macOS arm64. Cinco comandos, con/sin el wrapper anterior, sobre revisiones fijas de Ein. Se cuentan tokens con `o200k_base` sobre el texto entregado, **incluido el pie de Hypa**. Se guardan las salidas y el original completo del diff grande.

| Caso | Tokens de Pi | Tokens con Hypa | Resultado |
|---|---:|---:|---|
| Diff pequeño | 326 | 332 | **1,8 % más**; conserva las siete líneas modificadas |
| Diff grande | 13.351 | 6.029 | 54,8 % menos, pero omite **948 de 1.156 líneas modificadas** |
| Historial de 150 commits | 3.081 | 2.095 | 32 % menos; muestra **100 commits**, advierte que omite 50 |
| Referencia Git inexistente | 62 | 62 | Mismo error y salida con código 128 |
| Tests de Bun | 259 | 259 | Sin reducción: el wrapper no los intercepta |

Los dos diffs y `show` son brazos experimentales de la integración anterior: **la versión entregada ya no los envuelve**. En el diff grande Pi ya había recortado su vista, pero conservaba el original. El cotejo de líneas modificadas usa ese original completo, no solo la cola visible de Pi.

El pie del diff pequeño anuncia una reducción calculada antes de añadir el propio pie; por eso no sirve por sí solo para acreditar ahorro recibido por el agente. En este pase los comandos envueltos tardaron aproximadamente 0,20–0,50 s, frente a 0,008–0,030 s sin Hypa. No son una distribución de latencia ni una factura.

La implementación upstream de esta versión tiene [tee de fallo/truncación desactivado por defecto](https://github.com/Hypabolic/Hypa/blob/v0.1.14/src/Hypa.Runtime/Domain/Runner/CompressionOptions.cs), y su [runner](https://github.com/Hypabolic/Hypa/blob/v0.1.14/src/Hypa.Runtime/Application/Services/CommandRunnerService.cs) solo crea la referencia de recuperación cuando corresponde. Las salidas observadas no entregaron un original recuperable del diff reducido. No se presume compresión reversible.

## Comparación con Headroom y recomendación

La evaluación anterior de Headroom conservó los mil registros de JSON y redujo aproximadamente un 62 % los bytes de la vista de Pi. Sin embargo, no acreditó ahorro total del trabajo. Hypa cubre otros comandos y puede omitir información: **55 % menos texto en un diff no equivale a conservar la misma evidencia en menos espacio**. No se comparan porcentajes de corpora distintos como si fueran costes equivalentes.

Para Ein con Bun, el beneficio demostrado es limitado: no reduce sus tests ni el contexto inicial del orquestador; los diffs se protegen y el historial reducido es una vista de orientación. Para consultar el historial completo se puede usar `env git log ...`, que no se envuelve, o desactivar Hypa. Las vistas de status/log no deben tratarse como inventarios completos sin comprobarlo.

Recomendación: **conservar Hypa opcional, sin dedicar ahora más complejidad a esta vía**. Puede ayudar con salidas verbosas de comandos compatibles. No se ha medido aquí la fidelidad de todos sus reducers ni demostrado ahorro global con agentes. El ahorro de entradas iniciales y encargos mejor definidos sigue siendo independiente del compresor.

## Validación y entrega

- **59 tests enfocados**, cero fallos, incluidos paquete extraído, controles de fases, resolución de binario y routing; typecheck correcto.
- SDK real, foreground y coexistencia de proveedores: encuentra Homebrew sin `HYPA_BIN`, ejecuta Hypa una sola vez para log, conserva el diff crudo y bloquea force-push **antes de ejecutar**.
- La corrección se incorpora a **#404**, sin otra PR ni cambios en el checkout original. La instalación personal recibirá el cambio al actualizar desde la versión integrada; no se ha parcheado en caliente.
- [Datos](hypa-followup-2026-09-09.json) y [archivo de evidencias](hypa-followup-2026-09-09-evidence.json). La evaluación anterior de Headroom permanece en [su informe histórico](closed-cheap-flow-2026-09-09.md).
