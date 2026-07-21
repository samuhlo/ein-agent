# 06. Revisión original de Ein

**Estado inicial:** planned

## Resultado
Ein incorpora revisión manual, original y de solo lectura para descubrir riesgos antes de la entrega.

## Problema actual
El activo heredado `judgment-day` no representa una implementación original de Ein.

## En alcance
- Sustituir `judgment-day` por una implementación original Ein-native.
- Un agente de solo lectura `ein-reviewer`.
- Revisión normal con una instancia nueva; dual con dos instancias ciegas del mismo agente en paralelo.
- Activación manual inicial.
- Clasificación: mismo hallazgo confirmado, uno sospechoso, contradicción requiere decisión humana.
- Correcciones solo por `sdd-apply`, seguidas de re-verify, recibo nuevo y re-review.
- Salida breve en español, sin emojis ni teatralidad.

## No objetivos
- Grafo de actores de cuatro lentes.
- Revisión automática antes de cada PR.

## Mecanismo interno
Las instancias reciben el mismo objetivo sin ver la salida de la otra. El padre sintetiza conservando ambos hallazgos de origen y usa campos estables —ruta, símbolo o categoría y comportamiento—: confirma coincidencias exactas o de equivalencia segura, mantiene como sospechosos los hallazgos sin pareja y deriva contradicciones a decisión humana. No hay fusión automática difusa ni autoridad determinista.

## Archivos o áreas previstos

> Pronóstico, no contrato fijo de implementación.

- Definición de `ein-reviewer`, comando o documentación de activación y sustitución de activos de revisión.

## Criterios de aceptación

- [ ] `ein-reviewer` DEBE ser de solo lectura.
- [ ] La revisión dual DEBE usar dos instancias ciegas en paralelo.
- [ ] El padre DEBE sintetizar usando ruta, símbolo o categoría y comportamiento, conservando ambos hallazgos de origen.
- [ ] Las coincidencias exactas o de equivalencia segura DEBEN confirmarse; los hallazgos sin pareja DEBEN permanecer sospechosos y las contradicciones DEBEN requerir decisión humana.
- [ ] NO DEBE haber fusión automática difusa ni reclamación de autoridad determinista.
- [ ] Toda corrección DEBE pasar por apply, nueva verify, recibo y revisión.
- [ ] El activo heredado SOLO DEBE retirarse cuando exista sustituto original.

## Matriz de verificación y pruebas

| Comprobación | Evidencia esperada |
|---|---|
| Normal | Una instancia nueva produce salida breve. |
| Dual | Dos instancias no reciben resultados entre sí. |
| Síntesis | El padre conserva ambos hallazgos, confirma solo coincidencias exactas o de equivalencia segura, mantiene los no emparejados como sospechosos y deriva contradicciones a decisión humana. |
| Límites | No hay fusión automática difusa ni autoridad determinista. |
| Corrección | Exige el ciclo completo posterior. |

## Riesgos
Dos agentes iguales no garantizan diversidad; la modalidad dual aumenta independencia temporal, no autoridad automática.

## Dependencias
05 para que la revisión y sus correcciones sigan las pruebas de resiliencia de entrega.

## Límite de reversión
Restaurar el punto de activación manual; no retirar el activo previo antes de contar con reemplazo.

## Checklist de finalización

- [ ] Agente original definido.
- [ ] Protocolo normal y dual documentado.
- [ ] Correcciones encadenadas.
- [ ] Sustitución segura del activo.
