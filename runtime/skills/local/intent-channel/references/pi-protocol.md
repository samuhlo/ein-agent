# Protocolo Pi

`ein_intent` es el único escritor. `work` identifica el acuerdo; en SDD, `change`
debe coincidir. El runtime valida el nombre. `.ein/intent-drafts/<work>.json` guarda el borrador privado;
la primera entrevista no crea directorio de cambio hasta confirmar `intent.md`.
Reabrir un acuerdo existente lo marca pendiente para impedir ejecutar material obsoleto.

## Rondas y recibos

Cada mutación pasa `expectedRevision`: `draftRevision` del último estado/recibo,
o `absent` al crear. Un conflicto conserva la respuesta en su sesión de origen:
recarga y reutilízala en la misma ronda, sin confirmar material distinto.

- `propose`: conserva el árbol conocido completo en `decisions`, también los nodos
  aplazados y resueltos: id, question, dependsOn, status (open/waiting/resolved),
  kind (decision/fact/permission), resolution con respuesta o evidencia. Da títulos
  cortos al acuerdo y a sus nodos. No cuentes hechos ni permisos como producto.
- `material`: objetivo, límites y criterios observables provisionales. Puede omitirse
  en rondas siguientes para reutilizarlo. Actualízalo cuando cambie el acuerdo.
- `questionnaire`: solo la frontera lista, con question, header (hasta 16 caracteres),
  options (2–4 label/description, recomendación primero) y multiSelect solo para
  opciones combinables. `questions` se deriva automáticamente. El plugin añade
  respuesta libre; no añadas «Otra». Vacío es válido al esperar hechos.
- Explica la ronda y usa el cuestionario devuelto sin alterar opciones. El selector
  admite cuatro preguntas por llamada: divide fronteras mayores en tandas de la
  misma ronda sin otro propose ni avanzar dependencias entre tandas.
- `ask_user_question` añade `intentResponse` con work, revision, draftRevision y responseId observado.
  Usa ese recibo directamente. No es un mensaje de chat ni debes fabricar inputs.
  Si falta, o al reanudar, `status` recupera acuerdo y respuesta; sin work consulta
  el work del objetivo o el único borrador pendiente. Varios borradores requieren
  elegir work explícito. Cancelación o error no producen responseId usable.
- Otra `propose` incorpora únicamente lo contestado y conserva las ramas anteriores.
  `review` recibe el árbol completo resuelto y responseId de la última ronda.
  Presenta el material devuelto y pregunta con su cuestionario final.
- `confirm` exige una NUEVA respuesta afirmativa a esa revisión exacta. Una corrección
  requiere otra ronda y revisión; contestar una ronda no confirma el acuerdo.
  En el selector final solo «Confirmar acuerdo» sin notas confirma. Texto libre o
  notas se incorporan antes de revisar otra vez; no son una elección automática.
- `cancel` detiene el trabajo. `delegate` exige instrucción humana explícita de
  decidir sin preguntas; modo auto no equivale a ese permiso.

Si falla el selector o la pregunta es abierta, usa texto y espera una respuesta real.
No simules recibos. `status` distingue incorporar respuesta, preparar evidencia,
ejecutarla, recuperar el resultado de un ensayo iniciado y procesarlo mediante nextAction.
Un hecho pendiente no implica que un ensayo esté en marcha.
`recover-publication` exige `ein_intent recover` con work y expectedRevision para
recuperar el journal exacto; no volver a pedir un acuerdo
ya observado. Un recibo `archived` es historia y no autoriza otra ejecución.

## Ensayos locales

Usa `investigate` con el hecho pendiente, responseId de autorización ya observada
(también del historial), objetivo, raíces y comandos exactos. Incorpora primero los
permisos contestados mediante propose. Ejecuta el encargo devuelto a `sdd-verify`:
produce evidencia sin cerrar intent ni iniciar una fase SDD. No ejecutes el ensayo
por fuera del arnés ni cambies código. Un rechazo técnico conserva el permiso;
corrige dentro de su alcance sin pedirlo de nuevo. Una ampliación material requiere
nueva autorización. Usa los hallazgos previos para preparar el ensayo, sin otro scout
general. Incorpora solo lo demostrado, incluso si falla, y abre la siguiente ronda
en ese turno. Si el resultado está truncado, recupera su salida antes de concluir.
