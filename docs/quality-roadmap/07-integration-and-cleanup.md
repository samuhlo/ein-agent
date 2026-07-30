# 07. Integración y limpieza

**Estado inicial:** planned

## Resultado
La superficie pública de Ein comunica el estado real de calidad y elimina narrativa supersedida de forma segura.

## Problema actual
Estado, ayuda y documentación pueden omitir la identidad candidata o conservar narrativa comparativa desactualizada.

## En alcance
- Integrar estado, doctor, ayuda, documentación y `EIN.md`.
- Mostrar candidato `verified`, `stale` o `missing` sin exagerar garantías.
- Auditar presupuesto de prompt/tokens.
- Retirar activos heredados solo cuando exista sustitución original.
- Limpiar narrativa comparativa activa sin borrar identificadores de dependencia, rutas de compatibilidad, evidencia archivada ni atribución legal requerida antes de reemplazo.
- Ejecutar revisión dual final.

## No objetivos
- Vigilancia automática.
- Borrado indiscriminado de compatibilidad, evidencia o atribución.

## Mecanismo interno
Las interfaces consultan el mismo estado de recibo; la limpieza se limita a narrativa activa y registra excepciones protegidas. La revisión dual final usa la síntesis del padre definida en el protocolo de 06.

## Archivos o áreas previstos

> Pronóstico, no contrato fijo de implementación.

- Estado/doctor/ayuda, `EIN.md`, documentación activa y presupuesto de prompts.
- Activos heredados sustituidos y revisión final.

## Criterios de aceptación

- [ ] Estado, doctor y ayuda DEBEN reflejar `verified`, `stale` o `missing` honestamente.
- [ ] La limpieza NO DEBE eliminar identificadores, compatibilidad, evidencia archivada ni atribución protegida.
- [ ] Los activos supersedidos SOLO DEBEN eliminarse tras existir reemplazo original.
- [ ] La revisión dual final DEBE quedar registrada.
- [ ] No DEBE añadirse vigilancia automática.

## Matriz de verificación y pruebas

| Comprobación | Evidencia esperada |
|---|---|
| Interfaces | Los tres estados se muestran de forma coherente. |
| Limpieza | Las excepciones protegidas permanecen. |
| Presupuesto | Auditoría identifica consumo y límite aceptado. |
| Revisión | El padre sintetiza dos resultados ciegos conforme al protocolo de 06, conservando los hallazgos de origen y derivando contradicciones a decisión humana. |

## Riesgos
La limpieza textual puede confundir referencias activas con evidencia histórica; se requiere lista explícita de exclusiones.

## Dependencias
01–06.

## Límite de reversión
Revertir solo las integraciones públicas; conservar recibos y evidencia ya producidos.

## Checklist de finalización

- [ ] Interfaces integradas.
- [ ] `EIN.md` actualizado.
- [ ] Presupuesto auditado.
- [ ] Limpieza acotada.
- [ ] Revisión dual final.
