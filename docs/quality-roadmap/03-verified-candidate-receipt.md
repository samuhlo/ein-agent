# 03. Recibo de candidato verificado

**Estado inicial:** planned

## Resultado
Una verificación SDD exitosa identifica de forma local los bytes exactos candidatos a entrega.

## Problema actual
La verificación puede terminar antes de que se determine qué contenido exacto se entregará.

## En alcance
- Árbol candidato sintético tras `sdd-verify` exitoso mediante índice Git temporal, sin mutar índice ni worktree reales.
- Inclusión exclusiva de rutas tracked/untracked previstas.
- Recibo local versionado bajo el área administrativa Git específica del worktree, no versionado.
- Vínculo entre identidad de repositorio/worktree, árbol candidato, digest de rutas previstas, digest del informe y digest de comandos/evidencia.
- Fallo cerrado ante recibo ausente, corrupto o no coincidente en carriles que afirman entrega verificada.
- Carril mecánico/no SDD explícito que puede proceder bajo la autorización de usuario existente, sin afirmar verificación y etiquetado como no verificado.

## No objetivos
- Escribir el recibo en Git.
- Afirmar que el carril mecánico está verificado.

## Mecanismo interno
Se crea un índice temporal aislado, se materializan solo rutas previstas y se calcula su árbol. La publicación del recibo es atómica dentro del área administrativa del worktree.

## Archivos o áreas previstos

> Pronóstico, no contrato fijo de implementación.

- Utilidades de Git temporal, formato/versionado de recibo y `sdd-verify`.
- Área administrativa del worktree y documentación del carril mecánico.

## Criterios de aceptación

- [ ] El proceso NO DEBE mutar el índice ni el worktree reales.
- [ ] El candidato DEBE excluir rutas no previstas.
- [ ] El recibo DEBE enlazar todas las identidades y digests definidos.
- [ ] Un recibo ausente, corrupto o no coincidente DEBE fallar de forma cerrada en todo carril que afirme entrega verificada.
- [ ] El carril mecánico/no SDD PUEDE proceder bajo la autorización de usuario existente, pero DEBE declararse y etiquetarse como no verificado.

## Matriz de verificación y pruebas

| Comprobación | Evidencia esperada |
|---|---|
| Aislamiento | Índice y worktree reales permanecen sin cambios. |
| Contenido | El árbol contiene solo rutas previstas. |
| Integridad | Cada digest e identidad se valida; un recibo ausente, corrupto o no coincidente bloquea el carril que afirma entrega verificada. |
| Carril mecánico/no SDD | Con autorización de usuario existente puede proceder sin recibo válido, pero permanece declarado y etiquetado como no verificado. |

## Riesgos
Las rutas untracked requieren inclusión explícita para no confundir suciedad local con contenido candidato.

## Dependencias
02, porque el candidato se vincula a la verificación SDD canónica.

## Límite de reversión
Eliminar el recibo local y revertir el productor/consumidor como una unidad.

## Checklist de finalización

- [ ] Índice temporal aislado.
- [ ] Formato de recibo versionado.
- [ ] Publicación atómica.
- [ ] Carril mecánico documentado.
