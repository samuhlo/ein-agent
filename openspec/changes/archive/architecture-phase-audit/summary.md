status: complete
change: architecture-phase-audit
work_groups: 1
verification_status: pass

## // 000. RESUMEN

La auditoría final cierra la fase arquitectónica: estado del proyecto, sesiones
y extensión principal de Pi tienen dueños separados y fronteras comprobables.
El siguiente trabajo es la matriz de beta; el instalador solo se divide si esa
evidencia descubre una costura real.

## // 001. QUÉ CAMBIÓ

- `docs/adr/0004-close-architecture-phase.md` conserva la medición, la decisión
  de parada y las condiciones que justificarían reabrir la arquitectura.
- `docs/roadmap.md` retira la fase 7 ya completada y mueve el posible corte de
  `install.ts` junto a la evidencia de ciclo de vida que debe decidirlo.
- La prueba de fronteras impide que `ein-ai.ts` vuelva a implementar hooks,
  comandos o herramientas dentro de la raíz de composición.
- Doctor y seis contratos estáticos siguen ahora a los módulos propietarios en
  vez de buscar comportamiento en la antigua fachada monolítica.

## // 002. CÓMO FUNCIONA POR DENTRO

La auditoría no usa longitud como nota. Comprueba dónde vive cada decisión:
`project-state.ts` ensambla lectores; `runtime-session-adapters.ts` normaliza el
contrato y delega identidad, plan, ejecución y metadatos; `ein-ai.ts` crea y
conecta dueños. Los cinco puentes SDD restantes ya tienen motivo, propietario y
condición de retirada, y el payload instalado conserva esas fronteras.

La primera suite completa encontró seis comprobaciones que todavía miraban el
antiguo cajón. Se actualizaron para recorrer `extensions/internal/` y observar
al dueño real. No se relajó ninguna expectativa funcional.

## // 003. DECISIONES

- Cerrar la fase arquitectónica sin perseguir cero puentes ni ficheros
  pequeños.
- Mantener `runtime-session-adapters.ts` como frontera pública coherente; sus
  efectos y decisiones especializadas ya viven fuera.
- No partir `installer/src/cli/install.ts` por tamaño. La matriz de beta deberá
  aportar un fallo o coste conjunto y nombrar la costura antes de abrir ese
  trabajo.
- Mantener `ein-linear.ts` y `model-config.ts` fuera mientras no exista una
  responsabilidad mezclada medida.

## // 004. VERIFICACIÓN

- verify: `bun test` — 3.008 pass, 0 fail, 229 ficheros.
- verify: `bun run typecheck`.
- verify: `cd installer && bun run typecheck`.
- verify: `cd installer && bun run bundle-template:host` — archive de 27,67 MB
  generado con cierre y entrypoints instalados válidos.
- verify: `git diff --check`.

## // 005. PENDIENTE / RIESGOS

- La beta no está cerrada: faltan los escenarios reales de update, rollback,
  uninstall y conservación en hogares desechables.
- `install.ts` sigue siendo una zona a observar durante esos escenarios. Eso es
  una hipótesis explícita, no deuda arquitectónica aprobada de antemano.
- Los puentes supervivientes se retiran por sus condiciones documentadas, no
  para reducir un contador.
