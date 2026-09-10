# ADR 0006 — Retirar Hypa y Headroom del runtime

status: accepted
date: 2026-09-10

## Decisión

Ein deja de integrar Hypa y Headroom. Se elimina el wrapper de Hypa, sus
comandos, ajustes, onboarding, indicadores y rutas de instalación y actualización.
Headroom no se incorpora: su PR #401 queda cerrada como referencia histórica.
No se sustituyen por otro compresor.

La decisión sigue el objetivo del proyecto: **hacer que pensar bien permita
ejecutar de forma más sencilla, barata y local, manteniendo las exigencias de
calidad**. La ejecución local es futura y opcional; los modelos baratos alojados
siguen siendo válidos.

## Motivo

La evaluación no acreditó un ahorro del flujo completo que justificara mantener
estas integraciones para el uso actual de Ein. Reducir el tamaño de una salida
no demuestra reducir el gasto del modelo caro: importa quién la recibe, si
conserva lo necesario y si después hay que pedir el original o repetir trabajo.

Hypa podía omitir código modificado en los diffs. Headroom conservaba los datos
en los formatos comprobados, pero añadía un servicio y no demostró abaratar el
trabajo completo en esa muestra. Esto justifica retirarlos de Ein; no afirma que
sean inútiles en otros proyectos ni que nunca puedan ahorrar tokens.

La prioridad pasa a encargos bien definidos, skills pertinentes, contexto fresco
por hijo y comprobaciones deterministas con evidencia revisable. No se amplía
la plataforma para intentar justificar un compresor.

## Comportamiento resultante

- Los comandos conservan la ruta nativa de Pi, sin reescritura por Hypa ni
  compresión por Headroom. Se mantienen las guardas de seguridad y staging.
- Verify conserva su vista acotada de comprobaciones con referencia al log
  completo, su ejecución independiente y los criterios de calidad. También se
  conserva la compactación nativa de Pi. No dependen de estos dos productos.
- La configuración y el onboarding no ofrecen compresores. Los antiguos
  `.pi/ein/hypa.json` y `headroom.json` quedan ignorados, sin reactivación aunque
  indiquen `on`. No se eliminan archivos personales para conseguirlo.
- Instalar, actualizar y ejecutar doctor ya no busca, instala, actualiza ni
  recomienda Hypa. El instalador no añade Headroom ni su servicio.
- La sustitución existente de directorios administrados elimina el código viejo
  de `lib/` y `extensions/` al actualizar. No se desinstalan binarios externos
  que el usuario pueda utilizar por su cuenta ni se borran credenciales.

## Compatibilidad acotada

Se conserva el vocabulario V1 necesario para decodificar journals antiguos,
incluido `pi.dependency.hypa`, y el flag antiguo `--no-hypa` se acepta sin efecto.
Los planes nuevos no generan ese paso; su handler legado no realiza acciones
externas. No se relajan los controles de reanudación ni se crea otro formato.

El índice de evidencia sigue reconociendo el marcador de una vista histórica de
Headroom para no confundirla con una salida completa. Reconocer ese texto no
carga ni ejecuta un compresor.

## Transición desde un instalador anterior

Sustituir el ejecutable en disco no sustituye el proceso que ya está corriendo.
Se reprodujo el salto desde `0.96.0-alpha.4` a `0.97.0-alpha.1` con Hypa presente:
el proceso anterior ejecuta una última revisión de Hypa, aunque el runtime nuevo
ya no lo contiene. Una ejecución posterior del instalador `0.97.0-alpha.1` no
lo invoca. La retirada del runtime y los efectos de la transición son controles
diferentes; comprobar solo el marker y los archivos instalados era insuficiente.

La corrección delega la política de herramientas externas al binario instalado,
mediante la continuación ya existente y comprobando su identidad. Si el destino
no soporta la acción o devuelve una respuesta inválida, se informa del fallo
opcional y no se ejecuta la política anterior como alternativa. Los avisos del
padre no enumeran herramientas que puedan haber sido retiradas por el destino.

Esta corrección protege las actualizaciones iniciadas con el instalador
corregido; no puede cambiar retroactivamente el código de los binarios antiguos
ya publicados. Sus últimos efectos heredados se registran en la prueba de salto.

## Evidencia y validación

Los informes [del flujo completo](../../evals/closed-cheap-flow-2026-09-09.md) y
[del seguimiento de Hypa](../../evals/hypa-followup-2026-09-09.md) se conservan
como registros históricos; esta decisión sustituye sus recomendaciones de uso.

Las regresiones comprueban ausencia de compresores en el paquete, comandos y
ajustes; configuración antigua inerte; comandos sin reescritura en las fases del
SDK nativo; eliminación de código administrado al actualizar sin tocar estado
personal; y planes nuevos sin Hypa con decodificación V1 conservada. No se lanza
otra batería de modelos para medir una integración que se ha decidido retirar.
