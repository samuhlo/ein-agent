## // 000. RESUMEN

La `0.93.0-alpha.4` completa la instalación en Omarchy: Claude Code pasa a ser
una dependencia real del destino Claude y GitHub CLI deja de ser una
instrucción manual disfrazada de paso completado.

## // 001. QUÉ CAMBIÓ

- El plan declara, instala con el instalador nativo oficial y verifica Claude
  Code antes de desplegar la integración y sus launchers.
- En Omarchy, `gh` se instala mediante `omarchy-mise-install` con el backend
  inequívoco `github:cli/cli`; Arch genérico usa el paquete `github-cli` de
  Pacman. Todos los caminos verifican el ejecutable antes de declarar éxito.
- El bootstrap acepta `--runtime pi`, `--runtime claude` y `--runtime both`, y
  propaga el destino elegido a una release alpha exacta.

## // 002. VERIFICACIÓN

- Tests unitarios cubren instalación, fallo cerrado y verificación de Claude,
  además de Omarchy/Mise, Pacman y errores de instalación de `gh`.
- Tests de contrato prueban el nuevo paso obligatorio y la propagación exacta
  de `--runtime both` desde el bootstrap.
- Docker reproduce el fallo publicado de `alpha.1`, recupera el diario con Pi,
  instala después ambos runtimes, descarga Claude Code real y ejecuta `ein-cc`
  desde Fish.
- El smoke post-publicación actualiza desde `installer-v0.93.0-alpha.3`.

## // 003. RIESGO RESIDUAL

La instalación nativa de Claude y los gestores de paquetes necesitan red; los
fallos externos se conservan como errores explícitos y no se convierten en
éxitos falsos.
