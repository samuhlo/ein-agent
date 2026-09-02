## // 000. RESUMEN

Estado y ayuda salen de la raíz de composición. Un módulo de presentación lee la configuración y el proyecto, construye el informe humano y registra los dos comandos públicos.

## // 001. QUÉ CAMBIÓ

- `ein-status-commands.ts`: posee `/ein:status` y `/ein:help`.
- `ein-ai.ts`: se limita a registrar esa superficie.
- Un test fija los dos comandos y prohíbe que el handler regrese a la fachada.

## // 002. CÓMO FUNCIONA POR DENTRO

El estado reúne agentes, chains, skills, configuración, cambios SDD, frescura de `EIN.md` y MCP. Solo presenta hechos ya resueltos por sus dueños; no cambia el proyecto ni participa en los hooks.

## // 003. DECISIONES

- Mantener estado y ayuda juntos como superficie humana de diagnóstico básico.
- No dividir el render por secciones: tiene un único dueño y una única salida.
- Terminar aquí el corte de la fachada; su tamaño restante corresponde a composición real.

## // 004. VERIFICACIÓN

- 119 tests enfocados: pass.
- Typecheck de raíz e instalador: pass.
- `git diff --check`: pass.

## // 005. PENDIENTE / RIESGOS

La extracción de `ein-ai.ts` queda cerrada. Falta la auditoría global: suite completa, payload instalado, puentes, dueños y decisión documentada sobre los hotspots restantes.
