# Revisión de documentación — 2026-09-10

Base de código: `303898d` (incluye PR #407). Fuentes de documentación revisadas y registradas en `7c3dd072fdc872b46f680e09325c722ce59efa1b`.

## Alcance y decisiones

Se revisaron los 12 README versionados: se actualizaron los nueve propios y se conservaron los tres de fuentes externas en `vendor/skills/`. `vendor/README.md` aclara que los comandos de autoría de esos snapshots pertenecen al proyecto original y no son instrucciones de instalación de Ein.

Se actualizaron las 22 guías de la web y su portada, incluida la navegación a releases. Los contenidos describen el código de esta revisión; las notas de versión distinguen lo publicado. La corrección de la política del actualizador en PR #407 no se atribuye al binario ya publicado `0.97.0-alpha.1`.

Cambios principales:

- Objetivo económico visible: pensar bien, ejecutar con encargos acotados y conservar calidad; modelos alojados baratos hoy, locales como objetivo futuro y opcional.
- Intención proporcional a lo que falta decidir; ruta ad-hoc con verificación independiente y SDD cuando corresponde.
- Skills pertinentes, contexto fresco sin una cifra fija, grupos de apply y límites de los packets.
- Verify independiente, cobertura explícita y conservación de informes al cerrar; sin presentar tipos/build como prueba universal de comportamiento.
- Retirada de Hypa/Headroom, diferencias reales Pi/Claude, instalación estable frente a alpha y recuperación por propiedad de archivos.
- Ejemplo SDD e informe de intent marcados como históricos, sin reescribir sus cifras como evidencia actual.

## Defectos encontrados al comprobar las instrucciones

La web solicitaba `/ein-agent/favicon.svg`, inexistente en el build. Se configura el recurso de marca ya distribuido como favicon. La cabecera y el atajo de releases apuntaban solo a la estable; ahora abren el índice que también muestra alphas.

La ayuda del instalador desde fuentes fallaba en un checkout sin `template.tar.gz`. Se corrigió la guía para ejecutar `bundle-template:host` antes de `dev --help`; el comando interno `bundle-template` requiere una app compilada y no sirve como preparación aislada.

Se retiraron procedimientos de recuperación basados en mover hogares completos, borrar secretos o asumir que los tests fallidos eran preexistentes. Doctor se describe según su salida actual: diez grupos, con detalle de problemas y resumen de grupos correctos.

## Validación realizada

| Comprobación | Resultado |
| --- | --- |
| Tests README, detector de drift, informe de drift y fronteras de arquitectura | 33 pass, 0 fail; 164 aserciones. |
| `bun run --cwd docs-site build` | 24 HTML generados: 22 guías, portada y 404; índice Pagefind y sitemap generados. |
| Detector `--check-sources` | 22 guías, cero rutas ausentes. |
| Detector de drift | 22 clean, 0 drifted, 0 unknown. |
| Procedencia adicional, incluida la portada MDX | 81 referencias de fuentes comprobadas con `git cat-file -e` en el commit declarado. |
| Auditoría del HTML generado con HTMLParser | 1.293 referencias locales de enlaces, recursos y anclas; cero destinos ausentes. Incluye navegación repetida entre páginas, no 1.293 URLs distintas. |
| Enlaces a fuentes del repo desde el HTML | Cuatro destinos de archivos existentes en este checkout. No implica comprobar todos los destinos externos en vivo. |
| Enlaces relativos de README propios | 20 destinos de archivo/directorio existentes. |
| Preview por HTTP local | 23 páginas de contenido y el recurso de marca: 24 respuestas 200. |
| `bun installer/scripts/bundle-template-host.ts` | Template del host macOS ARM64 generado. |
| `bun installer/src/main.ts --help` tras preparar assets | Correcto. |
| `bun ein-pi/agent/app.ts --help` | Correcto; confirma delegación de verbos de ciclo de vida. |
| `git diff --check` | Correcto. |

Comando de tests:

```bash
bun test tests/readme-release-ia.test.ts tests/docs-site-drift-detector.test.ts tests/docs-site-drift-report.test.ts tests/architecture-boundaries.test.ts
```

## Límites

La herramienta de navegador devolvió `No browser is available`; la lista de navegadores estaba vacía. No se acredita revisión visual, interacción con el buscador ni comprobación responsive. Se comprobó el sitio compilado y servido por HTTP, no el despliegue público posterior al merge.

No se modificó el comportamiento de agentes ni se ejecutó un benchmark de modelos. Tampoco se desplegó el checkout sobre la instalación del usuario. Esta validación corresponde a documentación y recursos del sitio, no a una nueva certificación del flujo SDD completo.
