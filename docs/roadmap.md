# Roadmap de Ein

Este documento contiene únicamente trabajo vigente. Las decisiones estables viven en `docs/adr/`, el comportamiento actual en `openspec/specs/` y la historia exhaustiva en Git y las releases.

## Ahora — fase 1, arquitectura mantenible

Objetivo: que el árbol explique el producto sin depender de conocimiento privado del autor.

- [x] Congelar la línea base de beta y retirar defaults heredados de modelos/proveedores.
- [x] Condensar OpenSpec a un resumen por cambio cerrado.
- [x] Reducir documentación interna, assets huérfanos y residuos de build.
- [x] Separar código de producto, runtime desplegable, vendor y tooling.
- [x] Hacer visible y única la propiedad del launcher público `ein`.
- [ ] Extraer contratos compartidos para eliminar dependencias Claude/installer → interiores de Pi.
- [ ] Añadir fronteras automáticas de imports y ownership.
- [ ] Dividir los hotspots principales una vez fijadas sus responsabilidades.

## Después — cierre de la beta

- Probar instalación, update, rollback y uninstall desde un HOME limpio.
- Alinear documentación pública, versión, artefactos y release.
- Publicar un quickstart reproducible y una demo del flujo completo.
- Mantener Pi como camino principal y declarar con precisión el soporte Claude.
- Verificar que integraciones opcionales ausentes degradan sin romper el núcleo.

## Secundario

- Perfil mínimo para facilitar pruebas de terceros, sin convertirlo en el centro del producto.
- Evals conductuales externos al propio historial.
- Packs adicionales de skills y preparación para contribuciones.

## Reglas de prioridad

- La arquitectura y la higiene entran ahora porque reducen el coste diario de mantener Ein.
- Ningún proveedor o modelo se selecciona por defecto. Ein puede recomendar esfuerzo, pero la elección pertenece al usuario.
- No se añade una integración nueva durante el cierre de beta salvo que bloquee el flujo principal.
- Un elemento completado sale de este roadmap; su resultado queda en spec, ADR, changelog o release según corresponda.
