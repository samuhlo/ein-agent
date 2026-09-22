# Recuperación de citas del scout

El incidente observado contenía `R6` con `lines: "49-83,91-117"`.
El validador de la alpha.9 rechazaba el informe completo antes de examinar
las citas contra disco. La regresión saneada conserva ese rango y el grafo
de 11 hallazgos y 12 referencias sin publicar contenido del proyecto personal.

La nueva normalización produce dos referencias exactas, conserva ambos apoyos
en el hallazgo y mantiene el límite de 24 referencias. Una referencia ilegible
o incompatible se retira junto con todos los hallazgos que dependan de ella;
el resto llega al padre. Tras pérdida de hallazgos o errores al interpretar
citas, el resumen original se sustituye por un aviso de evidencia parcial.

Reproducción directa, en memoria, de los dos artefactos originales contra los
archivos existentes, sin modificarlos:

- JSON con un hallazgo dañado: 7 hallazgos y 9 referencias conservados.
- R6 con tramos discontinuos: 11 hallazgos y 13 referencias conservados;
  R6 cubre 49–83 y la referencia nueva R13 cubre 91–117.

Las incertidumbres declaradas permanecen. Validar citas demuestra que apuntan
a archivos y líneas existentes; no demuestra por sí solo todas las conclusiones
del scout sobre autorización ni que el bloque 07 esté implementado.

Pruebas: `bun test tests/scout-evidence-recovery.test.ts tests/readonly-scout-contract.test.ts tests/scout-cross-root.test.ts`
comprueba rangos exactos, colisiones, límites, referencias ambiguas, pérdida
parcial de soporte, resumen afectado y contador de reintentos. 64 pruebas pasan.
La continuidad y presentación del resultado se completan en la PR dependiente.
