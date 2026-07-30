# 01. Paridad de CI en macOS

**Estado:** complete

La matriz y la política de Bun están implementadas y verificadas en CI remoto.

## Resultado
La integración continua cubre Ubuntu y macOS para los trabajos compatibles.

## Problema actual
La cobertura de plataforma no demuestra que el bundle de plantilla, las pruebas de Bun y el typecheck del instalador funcionen en macOS.

## En alcance
- Matriz `ubuntu-latest` y `macos-latest` para el bundle de plantilla, pruebas de Bun y typecheck del instalador.
- Política controlada y documentada para la versión de Bun.
- Docker E2E conservado exclusivamente en Ubuntu.

## No objetivos
- Soporte nativo de Windows.
- Ejecutar Docker E2E en macOS.

## Mecanismo interno
La configuración de CI fija Bun en `1.3.0` con actualización deliberada, no una versión flotante permanente. Los trabajos compatibles comparten la matriz; Docker E2E conserva su restricción a Ubuntu.

## Archivos o áreas previstos

> Pronóstico, no contrato fijo de implementación.

- Flujos de CI y documentación de versiones de Bun.
- Área de pruebas del instalador y bundle de plantilla.

## Criterios de aceptación

- [x] La matriz DEBE incluir `ubuntu-latest` y `macos-latest` para los tres trabajos compatibles.
- [x] Docker E2E DEBE ejecutarse solo en Ubuntu.
- [x] La política de Bun DEBE ser controlada y documentada.
- [x] La documentación NO DEBE afirmar soporte nativo de Windows.

## Matriz de verificación y pruebas

| Comprobación | Evidencia esperada |
|---|---|
| Matriz CI | Ambos sistemas ejecutan los trabajos compatibles. |
| Restricción Docker | El job E2E se programa solo en Ubuntu. |
| Política Bun | La versión resuelta coincide con la política documentada. |

## Evidencia remota

GitHub Actions [run 29817723219](https://github.com/samuhlo/ein-agent/actions/runs/29817723219) completó correctamente ambos jobs:

- [Ubuntu](https://github.com/samuhlo/ein-agent/actions/runs/29817723219/job/88592876945)
- [macOS](https://github.com/samuhlo/ein-agent/actions/runs/29817723219/job/88592877005)

## Riesgos
La disponibilidad de herramientas del instalador puede diferir entre runners; la matriz debe exponer esa diferencia.

## Dependencias
Ninguna.

## Límite de reversión
Revertir únicamente la configuración y documentación de la matriz; no modifica el comportamiento local.

## Checklist de finalización

- [x] Matriz declarada.
- [x] Política Bun documentada.
- [x] Evidencia de CI archivada.
