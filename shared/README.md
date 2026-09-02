# Shared

Esta raíz es la frontera ejecutable entre los adaptadores de Ein.

- `contracts/` contiene implementaciones agnósticas. No puede importar desde
  `ein-pi/`, `ein-cc/` ni `installer/`.
- `sdd/` contiene el núcleo SDD agnóstico y sus contratos propios.
- `ports/` publica capacidades con una API explícita. Es el único lugar donde
  se permiten puentes hacia implementaciones que todavía viven en Pi. Es una
  fachada de migración visible, no una prueba de que esas implementaciones ya
  sean agnósticas.

El código compartido puede leer y escribir directamente los artefactos del
proyecto que forman su protocolo público, como `openspec/changes/` y
`openspec/specs/`. No puede conocer hogares, configuración privada o interfaz de
un runtime, ni lanzar procesos. Git, reloj y ejecución de comandos llegan como
dependencias explícitas. La decisión completa vive en
`docs/adr/0003-shared-runtime-boundary.md`.

Claude y el instalador consumen estas rutas públicas y nunca interiores de
`ein-pi/agent/`. `tests/architecture-boundaries.test.ts` hace cumplir la regla y
obliga a declarar cualquier puente nuevo.

El template de Pi deriva el inventario de todos los `.ts` regulares situados en
la raíz de `contracts/` y `sdd/`. Ambos se despliegan a un único `lib/`, por lo
que dos módulos compartidos con el mismo nombre son una colisión y bloquean el
bundle.
