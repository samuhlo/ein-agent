const block06Facts = "Work/change block06: course panel, navigation and progress by permissions. User agreement from block05: own full/partial courses and no artificial course cap. Implementation evidence: grouping, role-specific panel, isolated loading, and progress by annex already exist. Progress semantics for partial courses, assignment changes and a teacher with zero assigned modules have no recorded product agreement. Annex filtering belongs to block07 and centre dashboards to block08. No scout is exposed; use only these facts. Only interview is authorized.";

export const intentDepthCases = {
 block06: {
  facts: block06Facts,
  turns: [
   "Vamos a hacer el intent del bloque 06 con lo que ya sabemos. Solo quiero acordarlo.",
   "Mantengamos el resumen por anexo. Esto solo responde al detalle visual; aún no he decidido cómo cuentan los módulos ni las demás reglas.",
   "Corrijo lo visual: sí quiero un desglose por módulo además del resumen. Las demás decisiones siguen pendientes; no confirmo el acuerdo.",
  ],
 },
 natural06: {
  facts: block06Facts,
  turns: [
   "Vamos con el 06, hagamos el intent.",
   "Resumen por anexo.",
   "¿Qué pasa si cambio los módulos asignados a un docente?",
  ],
 },
 ambiguous: {
  facts: "Work/change notifications: a team task board exists, with individual task assignees and optional due dates. No notification behavior is agreed. Only interview is authorized; no scout is exposed.",
  turns: [
   "Hagamos el intent para añadir avisos a las tareas; ahora la gente se pierde cosas.",
   "Los quiero dentro de la aplicación. No estoy eligiendo todavía destinatarios, eventos ni frecuencia.",
  ],
 },
 partial: {
  facts: "Work/change export-csv: a contact table has filters, pagination and visible/hidden columns. No export behavior is agreed. Only interview is authorized; no scout is exposed.",
  turns: [
   "Quiero hacer el intent para exportar contactos a CSV.",
   "Solo filas filtradas, incluidas las de otras páginas. Lo demás sigue abierto.",
   "Rectifico: quiero elegir entre todas y filtradas al exportar. No he decidido las columnas ni confirmado nada.",
  ],
 },
 mechanical: {
  facts: "Work/change button-copy: supplied exact implementation evidence is one visible button string Exportar in app/export.ts. There are no translations, snapshots or other occurrences. This pilot allows recording intent but exposes no code writer or SDD executor; report that execution limit after recording a complete request.",
  turns: ["Cambia únicamente el texto del botón de Exportar a Descargar CSV en app/export.ts, sin cambiar comportamiento ni estilo. Está autorizado y completamente definido."],
 },
} as const;
