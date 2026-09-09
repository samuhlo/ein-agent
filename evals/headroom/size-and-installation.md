# Tamaño e instalación opcional

Medido el 9 de septiembre de 2026 en macOS arm64, con `du -sk` sobre los
directorios completos. [Evidencia estructurada](installation-evidence.json).
Son tamaños en disco; no son RAM, tamaño de descarga ni una garantía para otras
plataformas.

| Instalación | MiB en disco |
| --- | ---: |
| Hypa npm, incluido su ejecutable nativo | 86,9 |
| Headroom 0.37.0, Python 3.13, después de usarlo | 537,6 |
| Headroom 0.37.0, Python 3.14, después de usarlo | 416,9 |
| uv privado del instalador, si hace falta | 38,7 |

El primer tamaño de Python 3.14, antes de importar las bibliotecas, fue ~389 MiB.
Las cachés de bytecode elevan esa medida a ~417 MiB. Por eso el instalador avisa
de **aproximadamente 420 MiB**, más Python/uv si faltan. La descarga de Python,
la caché compartida de paquetes y las versiones retenidas pueden ocupar espacio
adicional. El intérprete se comparte cuando uv encuentra uno compatible.

## Por qué pesa

La extensión de Ein son decenas de KiB de TypeScript; el peso está en el paquete
Python oficial y sus dependencias. En el piloto con 3.13 destacaban ast-grep
(~94 MiB), LiteLLM (~89), ONNX Runtime (~75), Transformers (~53) y el propio
Headroom (~35). Son componentes instalados por el paquete upstream aunque el
perfil de Ein no active todas sus funciones.

[El manifiesto oficial de Headroom 0.37.0](https://github.com/headroomlabs-ai/headroom/blob/v0.37.0/pyproject.toml)
excluye LiteLLM en Python 3.14 y posteriores. Usamos esa combinación admitida por
upstream, sin eliminar dependencias a mano. En esta máquina reduce el entorno
caliente un **22,4 %** frente al piloto con 3.13. Sigue siendo bastante más pesado
que Hypa: la elección opcional permite decidir si compensa para cada usuario.

## Decisiones del instalador y updater

- Headroom se presenta como opcional y recomendado, con finalidad y peso antes
  de elegir. La confirmación parte de «no». `--yes` no lo instala;
  `install --headroom` lo solicita y `--no-headroom` lo omite.
- Se instala después de verificar el núcleo, con una transacción propia. El
  instalador prepara uv privado si falta, sin cambiar perfiles de shell. Usa
  `headroom-ai[proxy]==0.37.0` oficial con Python 3.14 y prueba el servicio real
  antes de seleccionar la versión activa.
- El updater solo mantiene instalaciones gestionadas existentes, con la versión
  probada por Ein. Conserva versiones más nuevas o prereleases elegidas por el
  usuario. No sigue `latest` sin validación. `update --no-headroom` lo omite.
- Repetir la misma versión y perfil verificados no crea otro entorno. Un cambio
  de versión conserva el anterior para rollback; no hay poda automática de
  entornos antiguos ni de candidatos fallidos en esta entrega.
- Los entornos viven en `~/.pi-ein/agent.headroom`, fuera de los snapshots de
  Ein. El hogar alternativo usa el mismo sufijo `.headroom`. Un backup o restore
  de Ein no duplica estas dependencias. Los originales recuperables de cada
  sesión son datos aparte en el proyecto, con un límite de 32 MiB por sesión.
- Hypa deja de instalarse y actualizarse desde Ein. Se preservan su flag de
  omisión y los diarios de instalación V1 para recuperar instalaciones antiguas.

## Verificación reproducible

```bash
bun tooling/verify-headroom-installation.ts
```

Necesita red. Crea un hogar temporal, instala el uv oficial privado, instala y
verifica Headroom, repite la operación y comprueba que sigue habiendo un solo
entorno. Borra únicamente su hogar temporal al pasar; si falla, indica dónde
quedan los logs. CI ejecuta el mismo recorrido en Linux y macOS.

La prueba local final pasó: tablas, strings entrecomillados y logs reconstruidos
conservaron todos los datos; ahorraron respectivamente 11.694, 6.440 y 4.466 bytes
en sus fixtures. Esto valida compatibilidad del paquete y la instalación, no
predice ahorro de factura. La [evaluación con modelo](integration-results.md)
documenta resultados y limitaciones por separado.
