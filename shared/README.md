# Shared

Esta raíz es la frontera ejecutable entre los adaptadores de Ein.

- `contracts/` contiene implementaciones agnósticas. No puede importar desde
  `ein-pi/`, `ein-cc/` ni `installer/`.
- `ports/` publica capacidades con una API explícita. Es el único lugar donde
  se permiten puentes hacia implementaciones que todavía viven en Pi.

Claude y el instalador consumen estas rutas públicas y nunca interiores de
`ein-pi/agent/`. `tests/architecture-boundaries.test.ts` hace cumplir la regla y
obliga a declarar cualquier puente nuevo.
