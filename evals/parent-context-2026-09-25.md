# Contexto del padre: reproducción del incidente

La sesión aportada por Samu se analizó con `tooling/measure-parent-context.ts`. El informe cuenta bytes de resultados de herramientas, no tokens del proveedor ni contenido privado. Hubo una compactación nativa tras 256.274 tokens; el resumen ocupó 5.700 bytes. Compactar funcionó, pero las lecturas anteriores ya habían llenado la sesión.

| Herramienta | Llamadas | Bytes entregados | Sobre el límite de 4 KiB |
| --- | ---: | ---: | ---: |
| `read` | 27 | 258.732 | 21 |
| `ctx_execute_file` | 33 | 133.400 | 8 |

Una reproducción local pasó los resultados de `read`, `ctx_execute` y `ctx_execute_file` por `budgetParentOutput`: 73 llamadas habrían entregado 140.694 bytes frente a 409.203, una reducción del 66 % en **esas herramientas**. Los originales quedaron recuperables en archivos privados de sesión. Esta cifra es una simulación de transporte; no demuestra todavía ahorro de coste ni que un modelo termine antes. `ein_intent` y los resultados SDD no se acortaron porque sus campos pueden decidir el flujo.

El cambio de delegación resuelve por herramienta una referencia omitida solo si hay un cambio activo único. Un grupo distinto del siguiente sigue bloqueado con una instrucción de reanudación o reconciliación; no autoriza saltarlo. La guía de navegador se inyecta únicamente cuando `tasks.md` declara un comando Playwright o `test:e2e`. No se lanzó un navegador en esta evaluación.

**Revisión del control:** retirar o estrechar el límite de salida si Pi/context-mode ofrecen recuperación equivalente de resultados grandes, o si sesiones comparables muestran que las lecturas acotadas aumentan el coste total por cambio verificado. Medir primero resultado, relecturas y coste; no convertir el porcentaje de bytes en una meta aislada.

En una segunda sesión larga, 24 resultados `bash` entregaron 66.301 bytes al padre. Al pasar esos resultados por el mismo límite, tres habrían quedado acotados y el total habría sido 34.310 bytes (31.991 menos). El texto completo permanece recuperable y la vista breve de `bash` muestra el final, donde suelen estar el veredicto y los errores. Las nueve lecturas de `orchestrator.md` eran fragmentos distintos: deduplicarlas no habría ahorrado en ese incidente.
