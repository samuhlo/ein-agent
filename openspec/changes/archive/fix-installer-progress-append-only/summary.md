## // 000. RESUMEN
El avance de la instalación pasa a pintarse línea a línea, hacia abajo, en vez de
repintar la lista en sitio. La versión anterior subía el cursor tantas filas como
había pintado, y en una instalación real eso dejaba bloques de lista apilados y
el informe del doctor partido.

## // 001. QUÉ CAMBIÓ
- `installer/src/tui/progress-view.ts`: append-only.
- `installer/src/tui/progress.ts`: se retira `progressLines`.
- `spec_delta: none`.

## // 002. CÓMO FUNCIONA POR DENTRO
- La causa no era el cálculo del salto sino la premisa: la pantalla no es de la
  lista. Trece puntos de `install.ts` escriben durante los handlers, el informe
  completo del doctor incluido, y cada uno invalida la cuenta de filas pintadas.
- Ahora no se sube el cursor nunca. La cabecera anuncia el total una vez; cada
  paso deja una línea al cerrarse con su posición (`3/8`); un paso en curso
  reescribe SU propia línea con retorno de carro, que no puede pisar lo que
  escribió otro, y esa línea la cierra el resultado.
- Sin TTY no se emite ni el retorno de carro: `curl | bash` recibe un fichero, no
  una pantalla.

## // 003. DECISIONES
- Append-only en vez de arreglar el salto: llevar la cuenta de lo que escriben
  otros trece puntos es un contrato que rompe el siguiente `console.log` que
  alguien añada.
- El total en cabecera y la posición por línea, en vez de repetir la lista: se
  conserva el «cuánto falta» sin gastar el doble de pantalla.
- `progressLines` se retira entera; mantenerla sin usar invita a volver a
  llamarla.

## // 004. VERIFICACIÓN
- `bun test` — 2690 pass, 0 fail. Los dos typechecks, PASS.
- Ciclo estricto en tres contratos; el de ancho destapó que al reescribir la
  vista me había dejado el recorte fuera.
- Render rehecho con un handler escribiendo a mitad: se intercala sin pisar nada.

## // 005. PENDIENTE / RIESGOS
- Se pierde la lista de pendientes por nombre.
- Si un handler escribe mientras un paso está vivo, esa línea viva queda suelta
  arriba: una línea, no una lista rota.
