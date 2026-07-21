# 04. Puertas de recibo de entrega

**Estado inicial:** planned

## Resultado
La entrega solo avanza cuando conserva la identidad del candidato verificado.

## Problema actual
Un commit, push o PR puede divergir del contenido que superó verificación.

## En alcance
- Conservar el grant de intención de usuario de un solo uso existente.
- Puertas separadas de identidad de contenido antes de commit, tras commit contra `HEAD^{tree}`, antes de push y antes de PR.
- Ruta de divergencia de vuelta a verify.
- Comportamiento definido para entrega trivial/mecánica y para desajuste de cabeza de PR.

## No objetivos
- Bloqueos, grafo de autoridad, diarios, demonio, binario nativo, ni sistema de recuperación automática.

## Mecanismo interno
Cada punto recalcula o compara la identidad requerida con el recibo. La intención autoriza la acción; el recibo autoriza el contenido. Son controles distintos.

## Archivos o áreas previstos

> Pronóstico, no contrato fijo de implementación.

- Agente `ein-git`, utilidades de comparación de árboles y mensajes de estado.
- Integración con recibos locales y flujo de PR.

## Criterios de aceptación

- [ ] La intención de usuario DEBE conservar su grant de un solo uso.
- [ ] Las cuatro puertas DEBEN validar identidad de contenido.
- [ ] Toda discrepancia DEBE regresar a verify y bloquear entrega.
- [ ] La entrega mecánica DEBE declararse sin verificación cuando corresponda.
- [ ] Una cabeza de PR distinta DEBE bloquear la apertura o actualización.

## Matriz de verificación y pruebas

| Comprobación | Evidencia esperada |
|---|---|
| Pre-commit | Rechaza árbol distinto al candidato. |
| Post-commit | Compara `HEAD^{tree}` con el recibo. |
| Push y PR | Rechazan rama o cabeza no coincidente. |

## Riesgos
Los hooks pueden modificar el índice entre controles; por eso se valida en cada frontera.

## Dependencias
03.

## Límite de reversión
Desactivar las puertas nuevas como grupo, sin cambiar el grant de intención existente.

## Checklist de finalización

- [ ] Cuatro puertas implementadas.
- [ ] Desvío a verify visible.
- [ ] Casos mecánicos documentados.
