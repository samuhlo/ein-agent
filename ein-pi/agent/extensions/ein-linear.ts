import { existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { commandName, loadBrand, slashCommand } from "./ein-brand";
import { t, tf } from "../lib/i18n/strings";
import { type Lang, pick, pickFor, readArtifactLang } from "../lib/lang";
import { LINEAR_KEY_PATH } from "./ein-paths";

const LINEAR_URL = "https://api.linear.app/graphql";

// BLINDAJE -> Linear rechaza mutations con IDs que no son String puros
// (UUIDs y claves humanas mezcladas rompen el schema GraphQL). Esta lista
// declara por mutación qué variables hay que normalizar antes de enviar.
// Añadir aquí cualquier ID nuevo; NO omitirlo, o el modelo barato
// probablemente mande un number o un objeto y Linear devuelva 400 críptico.
const LINEAR_MUTATION_CONTRACTS = {
  issueCreate: {
    idVars: ["teamId", "projectId", "projectMilestoneId", "stateId", "assigneeId", "labelIds"],
  },
  issueUpdate: {
    idVars: ["id", "stateId", "assigneeId", "projectMilestoneId"],
  },
  commentCreate: {
    idVars: ["issueId"],
  },
} as const;

type LinearParams = {
  query?: string;
  issueId?: string;
  projectId?: string;
  body?: string;
  limit?: number;
  team?: string;
  project?: string;
  title?: string;
  description?: string;
  stateId?: string;
  assigneeId?: string;
  state?: string;
  assignee?: string;
  labels?: string;
  milestone?: string;
  milestoneId?: string;
  milestonesJson?: string;
  issuesJson?: string;
  priority?: number;
};

const linearSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    issueId: { type: "string" },
    projectId: { type: "string" },
    body: { type: "string" },
    limit: { type: "number" },
    team: { type: "string", description: "Team key, name or id" },
    project: { type: "string", description: "Project name or id" },
    title: { type: "string" },
    description: { type: "string" },
    stateId: { type: "string" },
    assigneeId: { type: "string" },
    state: { type: "string", description: "State name or id (e.g. Todo, In Progress)" },
    assignee: { type: "string", description: "Assignee name/email/id or 'me'" },
    labels: { type: "string", description: "Comma-separated label names" },
    milestone: { type: "string", description: "Milestone name or id" },
    milestoneId: { type: "string", description: "Milestone UUID" },
    milestonesJson: { type: "string", description: "JSON array: [{name,targetDate}]" },
    issuesJson: { type: "string", description: "JSON array: [{title,description,priority,stateId,assigneeId,labels}]" },
    priority: { type: "number" },
  },
} as const;

type TeamNode = { id: string; key: string; name: string };
type ProjectNode = {
  id: string;
  name: string;
  state?: string;
  url?: string | null;
};
type LabelNode = { id: string; name: string };
type WorkflowStateNode = { id: string; name: string; type?: string };
type UserNode = { id: string; name?: string | null; email?: string | null };
type MilestoneNode = { id: string; name: string; targetDate?: string | null };

function linearToken(): string {
  const token = process.env.LINEAR_API_KEY
    || process.env.LINEAR_TOKEN
    || (existsSync(LINEAR_KEY_PATH) ? readFileSync(LINEAR_KEY_PATH, "utf8").trim() : "");
  if (!token) throw new Error("Falta token de Linear. Define LINEAR_API_KEY, LINEAR_TOKEN o el archivo local de secret antes de iniciar Pi.");
  return token;
}

async function linearGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: linearToken(),
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.map((error) => error.message).join("; ") || `Linear HTTP ${response.status}`);
  }
  return payload.data as T;
}

function coerceMutationVariables(
  operation: keyof typeof LINEAR_MUTATION_CONTRACTS,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  // FAIL CLOSED -> Solo casteamos lo declarado en el contrato; el resto pasa
  // tal cual para no romper inputs no-ID (priorities, enums, JSON strings).
  const contract = LINEAR_MUTATION_CONTRACTS[operation];
  const out: Record<string, unknown> = { ...variables };

  for (const key of contract.idVars) {
    const value = out[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      out[key] = value.map((item) => (item === undefined || item === null ? item : String(item)));
      continue;
    }
    out[key] = String(value);
  }

  return out;
}

async function linearMutation<T>(
  operation: keyof typeof LINEAR_MUTATION_CONTRACTS,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  return linearGraphql<T>(query, coerceMutationVariables(operation, variables));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

async function resolveTeamId(teamInput?: string): Promise<string> {
  if (!teamInput) throw new Error("team is required");
  const data = await linearGraphql<{ teams: { nodes: TeamNode[] } }>(
    `query Teams($first: Int!) { teams(first: $first) { nodes { id key name } } }`,
    { first: 100 },
  );
  const wanted = normalize(teamInput);
  const found = data.teams.nodes.find((team) => [team.id, normalize(team.key), normalize(team.name)].includes(wanted));
  if (!found) throw new Error(`Team not found: ${teamInput}`);
  return found.id;
}

async function resolveProjectId(teamId: string, projectInput: string): Promise<string | null> {
  void teamId;
  const data = await linearGraphql<{ projects: { nodes: ProjectNode[] } }>(
    `query Projects($first: Int!) {
      projects(first: $first) {
        nodes { id name state }
      }
    }`,
    { first: 100 },
  );
  const wanted = normalize(projectInput);
  const found = data.projects.nodes.find((project) => [project.id, normalize(project.name)].includes(wanted));
  return found?.id ?? null;
}

async function resolveLabelIds(labelsCsv: string | undefined, teamId: string): Promise<string[]> {
  if (!labelsCsv?.trim()) return [];
  const wanted = labelsCsv.split(",").map((label) => normalize(label)).filter(Boolean);
  if (!wanted.length) return [];

  const data = await linearGraphql<{ issueLabels: { nodes: LabelNode[] } }>(
    `query Labels($first: Int!, $teamId: ID!) {
      issueLabels(first: $first, filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name }
      }
    }`,
    { first: 250, teamId },
  );

  const ids: string[] = [];
  for (const token of wanted) {
    const found = data.issueLabels.nodes.find((label) => normalize(label.name) === token || normalize(label.id) === token);
    if (found) ids.push(found.id);
  }
  return ids;
}

async function resolveStateId(teamId: string, stateInput?: string): Promise<string | undefined> {
  if (!stateInput?.trim()) return undefined;
  const wanted = normalize(stateInput);
  const data = await linearGraphql<{ workflowStates: { nodes: WorkflowStateNode[] } }>(
    `query States($first: Int!, $teamId: ID!) {
      workflowStates(first: $first, filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name type }
      }
    }`,
    { first: 200, teamId },
  );
  const found = data.workflowStates.nodes.find((state) => {
    const byName = normalize(state.name) === wanted;
    const byId = normalize(state.id) === wanted;
    const byType = state.type ? normalize(state.type) === wanted : false;
    return byName || byId || byType;
  });
  if (!found) throw new Error(`Linear state not found: ${stateInput}`);
  return found.id;
}

async function resolveAssigneeId(assigneeInput?: string): Promise<string | undefined> {
  if (!assigneeInput?.trim()) return undefined;
  const wanted = normalize(assigneeInput);
  if (wanted === "me") {
    const data = await linearGraphql<{ viewer: { id: string } }>("query ViewerId { viewer { id } }", {});
    return data.viewer.id;
  }

  const users = await linearGraphql<{ users: { nodes: UserNode[] } }>(
    `query Users($first: Int!) { users(first: $first) { nodes { id name email } } }`,
    { first: 250 },
  );
  const found = users.users.nodes.find((user) => {
    const id = normalize(user.id);
    const name = user.name ? normalize(user.name) : "";
    const email = user.email ? normalize(user.email) : "";
    return [id, name, email].includes(wanted);
  });
  if (!found) throw new Error(`Linear assignee not found: ${assigneeInput}`);
  return found.id;
}

async function listProjectMilestones(projectId: string): Promise<MilestoneNode[]> {
  const data = await linearGraphql<{ projectMilestones: { nodes: MilestoneNode[] } }>(
    `query ProjectMilestones($first: Int!, $projectId: ID!) {
      projectMilestones(first: $first, filter: { project: { id: { eq: $projectId } } }) {
        nodes { id name targetDate }
      }
    }`,
    { first: 200, projectId },
  );
  return data.projectMilestones.nodes;
}

async function createProjectMilestone(projectId: string, name: string, targetDate?: string): Promise<MilestoneNode> {
  const data = await linearGraphql<{ projectMilestoneCreate: { success: boolean; projectMilestone: MilestoneNode } }>(
    `mutation CreateProjectMilestone($projectId: String!, $name: String!, $targetDate: TimelessDate) {
      projectMilestoneCreate(input: { projectId: $projectId, name: $name, targetDate: $targetDate }) {
        success
        projectMilestone { id name targetDate }
      }
    }`,
    { projectId, name, targetDate: targetDate ?? null },
  );
  if (!data.projectMilestoneCreate.success) throw new Error(`projectMilestoneCreate failed for: ${name}`);
  return data.projectMilestoneCreate.projectMilestone;
}

async function resolveMilestoneId(projectId: string, milestoneInput?: string, createIfMissing = false): Promise<string | undefined> {
  // createIfMissing distingue updateIssue (false: no crear) de createIssue
  // (true: auto-crear si el usuario escribió M0X y no existe).
  if (!milestoneInput?.trim()) return undefined;
  const wanted = normalize(milestoneInput);
  const milestones = await listProjectMilestones(projectId);
  // codePrefix: el usuario pide "M01" y el milestone real se llama
  // "M01 - Diseno visual y experiencia". Matchear el prefijo evita
  // obligarle a escribir el nombre completo.
  const found = milestones.find((milestone) => {
    const idMatch = normalize(milestone.id) === wanted;
    const name = normalize(milestone.name);
    const nameExact = name === wanted;
    const codePrefix = /^m\d{2}$/.test(wanted) && name.startsWith(`${wanted} -`);
    return idMatch || nameExact || codePrefix;
  });
  if (found) return found.id;
  if (!createIfMissing) throw new Error(`Linear milestone not found: ${milestoneInput}`);
  const created = await createProjectMilestone(projectId, milestoneInput.trim());
  return created.id;
}

function inferMilestoneNameFromTitle(title: string): string | undefined {
  // El formato M00..M07 es el código corto que usamos en títulos de issues
  // (ver buildBootstrapMilestones). Si el título lo lleva, lo cruzamos con el
  // milestone real cuyo nombre empieza por "M0X -".
  const match = title.match(/\b(M\d{2})\b/i);
  if (!match?.[1]) return undefined;
  return match[1].toUpperCase();
}

async function createProject(teamId: string, name: string, description: string): Promise<{ id: string; name: string; url: string | null }> {
  const data = await linearGraphql<{ projectCreate: { success: boolean; project: { id: string; name: string; url: string | null } } }>(
    `mutation CreateProject($name: String!, $description: String!, $teamIds: [String!]!) {
      projectCreate(input: { name: $name, description: $description, teamIds: $teamIds }) {
        success
        project { id name url }
      }
    }`,
    { name, description, teamIds: [teamId] },
  );
  if (!data.projectCreate.success) throw new Error("projectCreate failed");
  return data.projectCreate.project;
}

type BatchIssueInput = {
  title: string;
  description?: string;
  priority?: number;
  stateId?: string;
  assigneeId?: string;
  state?: string;
  assignee?: string;
  labels?: string;
  milestone?: string;
  milestoneId?: string;
};

type BootstrapPreset = "front-design" | "blog-content" | "ai-system" | "qa-hardening";

function parseBootstrapArgs(raw: string): { projectName: string; preset: BootstrapPreset } {
  // Formato esperado: "<nombre proyecto> | <preset>". La barra es el único
  // separador válido porque nombres de proyecto pueden llevar espacios.
  const value = (raw || "").trim();
  if (!value) {
    throw new Error(pick(
      `Uso: ${slashCommand("linear:project-bootstrap")} <nombre proyecto> | <front-design|blog-content|ai-system|qa-hardening>`,
      `Usage: ${slashCommand("linear:project-bootstrap")} <project name> | <front-design|blog-content|ai-system|qa-hardening>`,
    ));
  }
  const [projectNameRaw, presetRaw] = value.split("|").map((part) => part.trim());
  if (!projectNameRaw) {
    throw new Error(pick(
      `Falta nombre de proyecto. Ejemplo: ${slashCommand("linear:project-bootstrap")} Portfolio | front-design`,
      `Missing project name. Example: ${slashCommand("linear:project-bootstrap")} Portfolio | front-design`,
    ));
  }
  const preset = (presetRaw || "front-design") as BootstrapPreset;
  if (!["front-design", "blog-content", "ai-system", "qa-hardening"].includes(preset)) {
    throw new Error(pick(
      "Preset invalido. Usa: front-design, blog-content, ai-system, qa-hardening",
      "Invalid preset. Use: front-design, blog-content, ai-system, qa-hardening",
    ));
  }
  return { projectName: projectNameRaw, preset };
}

function buildBootstrapIssues(projectName: string, preset: BootstrapPreset, lang: Lang): BatchIssueInput[] {
  const milestones = buildBootstrapMilestones(preset, lang);
  const m = (index: number): string => milestones[index] ?? milestones[0] ?? milestones[0]!;
  const baseByPreset: Record<BootstrapPreset, BatchIssueInput[]> = {
    "front-design": [
      { title: pickFor(lang, "[[DESIGN]][[FEAT]] M01-001 Definir direccion visual y tokens base", "[[DESIGN]][[FEAT]] M01-001 Define visual direction and base tokens"), priority: 2, labels: "Design,Feature", milestone: m(1) },
      { title: pickFor(lang, "[[FRONT]][[IMPROVE]] M04-001 Implementar layout responsive base", "[[FRONT]][[IMPROVE]] M04-001 Implement base responsive layout"), priority: 3, labels: "Front,Improvement", milestone: m(4) },
      { title: pickFor(lang, "[[QA]][[DESIGN]] M07-001 Verificacion visual desktop/mobile", "[[QA]][[DESIGN]] M07-001 Visual verification desktop/mobile"), priority: 3, labels: "QA,Design,Improvement", milestone: m(7) },
    ],
    "blog-content": [
      { title: pickFor(lang, "[[DESIGN]][[DOCS]] M01-001 Definir direccion de contenido y estilo visual", "[[DESIGN]][[DOCS]] M01-001 Define content direction and visual style"), priority: 3, labels: "Design,Docs,Improvement", milestone: m(1) },
      { title: pickFor(lang, "[[FRONT]][[DOCS]][[IMPROVE]] M04-001 Implementar listado y detalle de posts", "[[FRONT]][[DOCS]][[IMPROVE]] M04-001 Implement post list and detail"), priority: 3, labels: "Front,Docs,Improvement", milestone: m(4) },
      { title: pickFor(lang, "[[QA]][[DOCS]] M07-001 Checklist de publicacion y SEO on-page", "[[QA]][[DOCS]] M07-001 Publishing checklist and on-page SEO"), priority: 3, labels: "QA,Docs,Improvement", milestone: m(7) },
    ],
    "ai-system": [
      { title: pickFor(lang, "[[SYS]][[AI]][[FEAT]] M02-001 Definir arquitectura de agentes y guardrails", "[[SYS]][[AI]][[FEAT]] M02-001 Define agent architecture and guardrails"), priority: 2, labels: "System,AI,Feature", milestone: m(2) },
      { title: pickFor(lang, "[[BACK]][[AI]][[IMPROVE]] M06-001 Integrar memoria y contratos de herramientas", "[[BACK]][[AI]][[IMPROVE]] M06-001 Integrate memory and tool contracts"), priority: 2, labels: "Back,AI,Improvement", milestone: m(6) },
      { title: pickFor(lang, "[[QA]][[AI]] M07-001 Verificar rutas criticas y degradacion segura", "[[QA]][[AI]] M07-001 Verify critical paths and safe degradation"), priority: 2, labels: "QA,AI,Improvement", milestone: m(7) },
    ],
    "qa-hardening": [
      { title: pickFor(lang, "[[QA]][[IMPROVE]] M00-001 Definir matriz de checks por flujo", "[[QA]][[IMPROVE]] M00-001 Define a check matrix per flow"), priority: 3, labels: "QA,Improvement", milestone: m(0) },
      { title: pickFor(lang, "[[SYS]][[QA]] M06-001 Automatizar smoke tests de comandos criticos", "[[SYS]][[QA]] M06-001 Automate smoke tests for critical commands"), priority: 3, labels: "System,QA,Improvement", milestone: m(6) },
      { title: pickFor(lang, "[[BUG]][[QA]] M07-001 Corregir regresiones detectadas en baseline", "[[BUG]][[QA]] M07-001 Fix regressions detected in baseline"), priority: 2, labels: "Bug,QA", milestone: m(7) },
    ],
  };

  return baseByPreset[preset].map((issue) => ({
    ...issue,
    description: pickFor(
      lang,
      `Proyecto: ${projectName}\n\n` +
        "/// 001. CONTEXTO\n" +
        `Issue semilla creada desde bootstrap ${loadBrand().agentName} para iniciar trabajo con alcance claro.\n\n` +
        "■ 002. ALCANCE\n" +
        "- Definir resultado observable\n" +
        "- Ejecutar implementacion en cambios reviewables\n\n" +
        "■ 003. CRITERIOS DE ACEPTACION\n" +
        "- [ ] Resultado verificable\n" +
        "- [ ] Riesgos documentados\n",
      `Project: ${projectName}\n\n` +
        "/// 001. CONTEXT\n" +
        `Seed issue created from ${loadBrand().agentName} bootstrap to start work with a clear scope.\n\n` +
        "■ 002. SCOPE\n" +
        "- Define an observable outcome\n" +
        "- Implement in reviewable changes\n\n" +
        "■ 003. ACCEPTANCE CRITERIA\n" +
        "- [ ] Verifiable result\n" +
        "- [ ] Risks documented\n",
    ),
  }));
}

function buildBootstrapMilestones(preset: BootstrapPreset, lang: Lang): string[] {
  void preset;
  return [
    pickFor(lang, "M00 - Descubrimiento y alcance", "M00 - Discovery and scope"),
    pickFor(lang, "M01 - Diseno visual y experiencia", "M01 - Visual design and experience"),
    pickFor(lang, "M02 - Base tecnica", "M02 - Technical foundation"),
    pickFor(lang, "M03 - Modelo de datos y backend", "M03 - Data model and backend"),
    pickFor(lang, "M04 - UI base y navegacion", "M04 - Base UI and navigation"),
    pickFor(lang, "M05 - Funcionalidad principal", "M05 - Core functionality"),
    pickFor(lang, "M06 - Estadisticas, automatizacion o IA", "M06 - Analytics, automation or AI"),
    pickFor(lang, "M07 - Pulido visual, QA y cierre", "M07 - Visual polish, QA and wrap-up"),
  ];
}

function visibleLinearAgentPrompt(task: string): string {
  // El prompt SIEMPRE reinyecta la regla de visibilidad para que el modelo
  // padre (que ya pasó por el preflight) no invente wrappers o chains privadas
  // que rompan el read-back determinista de Linear.
  return `Ruta visible obligatoria: delega a \`ein-linear\` mediante \`subagent({ agent: "ein-linear", task: "..." })\` si la tool esta disponible.

Si \`subagent\` no esta disponible en esta sesion, ejecuta el flujo de forma directa y visible con las tools \`linear_*\`; no uses wrappers opacos ni procesos privados.

Tarea Linear:
${task}`;
}

function visibleLinearBootstrapPrompt(task: string): string {
  // [DEPRECATED] La chain ein-linear-bootstrap se conserva SOLO como escape
  // manual. El flujo canónico de bootstrap es /linear:project-bootstrap
  // (handler abajo) que delega a ein-linear; la chain legacy queda para
  // quien ya la tenga en pipeline CI o en muscle memory.
  return `[DEPRECATED] La chain \`ein-linear-bootstrap\` queda solo como compatibilidad manual. Para trabajo nuevo, delega a \`ein-linear\` mediante \`subagent({ agent: "ein-linear", task: "..." })\` si la tool esta disponible.

Si \`subagent\` no esta disponible en esta sesion, ejecuta el bootstrap de forma directa y visible con las tools \`linear_*\`; no uses wrappers opacos, procesos privados ni payloads de chain para input natural.

Tarea Linear:
${task}`;
}

async function createIssue(input: {
  teamId: string;
  projectId?: string;
  projectMilestoneId?: string;
  title: string;
  description?: string;
  priority?: number;
  stateId?: string;
  assigneeId?: string;
  labelIds?: string[];
}): Promise<{ id: string; identifier: string; title: string; url: string | null }> {
  const data = await linearMutation<{ issueCreate: { success: boolean; issue: { id: string; identifier: string; title: string; url: string | null } } }>(
    "issueCreate",
    `mutation CreateIssue(
      $teamId: String!
      $projectId: String
      $projectMilestoneId: String
      $title: String!
      $description: String
      $priority: Int
      $stateId: String
      $assigneeId: String
      $labelIds: [String!]
    ) {
      issueCreate(input: {
        teamId: $teamId
        projectId: $projectId
        projectMilestoneId: $projectMilestoneId
        title: $title
        description: $description
        priority: $priority
        stateId: $stateId
        assigneeId: $assigneeId
        labelIds: $labelIds
      }) {
        success
        issue { id identifier title url }
      }
    }`,
    {
      teamId: input.teamId,
      projectId: input.projectId,
      projectMilestoneId: input.projectMilestoneId,
      title: input.title,
      description: input.description ?? "",
      priority: input.priority ?? 3,
      stateId: input.stateId,
      assigneeId: input.assigneeId,
      labelIds: input.labelIds ?? [],
    },
  );
  if (!data.issueCreate.success) throw new Error(`issueCreate failed for: ${input.title}`);
  return data.issueCreate.issue;
}

export default function einLinear(pi: ExtensionAPI) {
  pi.registerTool({
    name: "linear_viewer",
    label: "Linear Viewer",
    description: "Show authenticated Linear viewer.",
    parameters: linearSchema,
    async execute() {
      const data = await linearGraphql<{ viewer: { id: string; name: string; email: string } }>(
        "query Viewer { viewer { id name email } }",
        {},
      );
      return { content: [{ type: "text", text: JSON.stringify(data.viewer, null, 2) }], details: {} };
    },
  });

  pi.registerTool({
    name: "linear_list_teams",
    label: "Linear List Teams",
    description: "List available Linear teams.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      const data = await linearGraphql<{ teams: { nodes: TeamNode[] } }>(
        `query Teams($first: Int!) { teams(first: $first) { nodes { id key name } } }`,
        { first: params.limit ?? 100 },
      );
      return { content: [{ type: "text", text: JSON.stringify(data.teams.nodes, null, 2) }], details: {} };
    },
  });

  pi.registerTool({
    name: "linear_list_projects",
    label: "Linear List Projects",
    description: "List projects (optionally filtered by team).",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      const data = await linearGraphql<{ projects: { nodes: ProjectNode[] } }>(
        `query Projects($first: Int!) {
          projects(first: $first) {
            nodes { id name state url }
          }
        }`,
        { first: params.limit ?? 100 },
      );
      const wantedQuery = params.query ? normalize(params.query) : "";
      let nodes = data.projects.nodes;
      if (wantedQuery) {
        nodes = nodes.filter((project) => normalize(project.name).includes(wantedQuery) || normalize(project.id).includes(wantedQuery));
      }
      return { content: [{ type: "text", text: JSON.stringify(nodes, null, 2) }], details: { count: nodes.length } };
    },
  });

  pi.registerTool({
    name: "linear_list_milestones",
    label: "Linear List Milestones",
    description: "List milestones for a project.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      let projectId = params.projectId;
      if (!projectId) {
        if (!params.team || !params.project) throw new Error("projectId or (team + project) is required");
        const teamId = await resolveTeamId(params.team);
        projectId = await resolveProjectId(teamId, params.project) ?? undefined;
      }
      if (!projectId) throw new Error("Project not found");
      const milestones = await listProjectMilestones(projectId);
      return { content: [{ type: "text", text: JSON.stringify({ projectId, milestones }, null, 2) }], details: { count: milestones.length } };
    },
  });

  pi.registerTool({
    name: "linear_create_milestone",
    label: "Linear Create Milestone",
    description: "Create or reuse a milestone in a project.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      const milestoneName = params.milestone ?? params.title;
      if (!milestoneName?.trim()) throw new Error("milestone or title is required");
      let projectId = params.projectId;
      if (!projectId) {
        if (!params.team || !params.project) throw new Error("projectId or (team + project) is required");
        const teamId = await resolveTeamId(params.team);
        projectId = await resolveProjectId(teamId, params.project) ?? undefined;
      }
      if (!projectId) throw new Error("Project not found");
      const existing = await resolveMilestoneId(projectId, milestoneName, false).catch(() => undefined);
      if (existing) {
        return { content: [{ type: "text", text: JSON.stringify({ reused: true, milestoneId: existing }, null, 2) }], details: {} };
      }
      const milestone = await createProjectMilestone(projectId, milestoneName.trim());
      return { content: [{ type: "text", text: JSON.stringify({ reused: false, milestone }, null, 2) }], details: {} };
    },
  });

  pi.registerTool({
    name: "linear_ensure_project_milestones",
    label: "Linear Ensure Project Milestones",
    description: "Ensure a project has the requested milestone set.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      if (!params.milestonesJson) throw new Error("milestonesJson is required");
      let projectId = params.projectId;
      if (!projectId) {
        if (!params.team || !params.project) throw new Error("projectId or (team + project) is required");
        const teamId = await resolveTeamId(params.team);
        projectId = await resolveProjectId(teamId, params.project) ?? undefined;
      }
      if (!projectId) throw new Error("Project not found");

      const parsed = JSON.parse(params.milestonesJson) as Array<{ name: string; targetDate?: string }>;
      if (!Array.isArray(parsed)) throw new Error("milestonesJson must be an array");

      const existing = await listProjectMilestones(projectId);
      const reused: Array<{ id: string; name: string }> = [];
      const created: MilestoneNode[] = [];

      for (const milestone of parsed) {
        const name = milestone.name?.trim();
        if (!name) continue;
        const found = existing.find((item) => normalize(item.name) === normalize(name));
        if (found) {
          reused.push({ id: found.id, name: found.name });
          continue;
        }
        const createdMilestone = await createProjectMilestone(projectId, name, milestone.targetDate);
        created.push(createdMilestone);
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ projectId, reused, created }, null, 2) }],
        details: { reused: reused.length, created: created.length },
      };
    },
  });

  pi.registerTool({
    name: "linear_create_project",
    label: "Linear Create Project",
    description: "Create a project in a team.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      if (!params.team || !params.title) throw new Error("team and title are required");
      const teamId = await resolveTeamId(params.team);
      const existing = await resolveProjectId(teamId, params.title);
      if (existing) {
        return { content: [{ type: "text", text: JSON.stringify({ reused: true, projectId: existing }, null, 2) }], details: {} };
      }
      const project = await createProject(teamId, params.title, params.description ?? "");
      return { content: [{ type: "text", text: JSON.stringify({ reused: false, project }, null, 2) }], details: {} };
    },
  });

  pi.registerTool({
    name: "linear_list_project_issues",
    label: "Linear List Project Issues",
    description: "List issues for a project by id or project name + team.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      let projectId = params.projectId;
      if (!projectId) {
        if (!params.team || !params.project) throw new Error("projectId or (team + project) is required");
        const teamId = await resolveTeamId(params.team);
        projectId = await resolveProjectId(teamId, params.project) ?? undefined;
      }
      if (!projectId) throw new Error("Project not found");

      const data = await linearGraphql<{ issues: { nodes: Array<{ id: string; identifier: string; title: string; priority: number; url: string | null; state: { name: string; type: string } }> } }>(
        `query ProjectIssues($projectId: ID!, $first: Int!) {
          issues(filter: { project: { id: { eq: $projectId } } }, first: $first) {
            nodes { id identifier title priority url state { name type } }
          }
        }`,
        { projectId, first: params.limit ?? 100 },
      );
      return { content: [{ type: "text", text: JSON.stringify({ projectId, issues: data.issues.nodes }, null, 2) }], details: { count: data.issues.nodes.length } };
    },
  });

  pi.registerTool({
    name: "linear_search_issues",
    label: "Linear Search Issues",
    description: "Search Linear issues by text.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      const data = await linearGraphql<{ issues: { nodes: Array<{ id: string; identifier: string; title: string; state: { name: string } }> } }>(
        `query SearchIssues($term: String!, $first: Int!) {
          issues(filter: { or: [{ title: { containsIgnoreCase: $term } }, { description: { containsIgnoreCase: $term } }] }, first: $first) {
            nodes { id identifier title state { name } }
          }
        }`,
        { term: params.query ?? "", first: params.limit ?? 10 },
      );
      return { content: [{ type: "text", text: JSON.stringify(data.issues.nodes, null, 2) }], details: {} };
    },
  });

  pi.registerTool({
    name: "linear_get_issue",
    label: "Linear Get Issue",
    description: "Get a Linear issue by UUID or identifier.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      if (!params.issueId) throw new Error("issueId is required");
      const data = await linearGraphql<{ issue: unknown }>(
        `query Issue($id: String!) {
          issue(id: $id) { id identifier title description priority url state { name type } assignee { name email } team { name key } labels { nodes { name } } projectMilestone { id name } }
        }`,
        { id: params.issueId },
      );
      return { content: [{ type: "text", text: JSON.stringify(data.issue, null, 2) }], details: {} };
    },
  });

  pi.registerTool({
    name: "linear_create_issue",
    label: "Linear Create Issue",
    description: "Create a single issue in Linear.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      if (!params.team || !params.title) throw new Error("team and title are required");
      const teamId = await resolveTeamId(params.team);
      const projectId = params.project ? await resolveProjectId(teamId, params.project) : null;
      const labelIds = await resolveLabelIds(params.labels, teamId);
      const stateId = params.stateId ?? await resolveStateId(teamId, params.state);
      const assigneeId = params.assigneeId ?? await resolveAssigneeId(params.assignee);
      const inferredMilestone = params.title ? inferMilestoneNameFromTitle(params.title) : undefined;
      const milestoneInput = params.milestoneId ?? params.milestone ?? inferredMilestone;
      const projectMilestoneId = projectId
        ? await resolveMilestoneId(projectId, milestoneInput, Boolean(milestoneInput))
        : undefined;

      const issue = await createIssue({
        teamId,
        projectId: projectId ?? undefined,
        projectMilestoneId,
        title: params.title,
        description: params.description,
        priority: params.priority,
        stateId,
        assigneeId,
        labelIds,
      });

      return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }], details: {} };
    },
  });

  pi.registerTool({
    name: "linear_update_issue",
    label: "Linear Update Issue",
    description: "Update a Linear issue by UUID.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      if (!params.issueId) throw new Error("issueId is required");
      let teamId = params.team ? await resolveTeamId(params.team) : undefined;
      if (!teamId && params.state) {
        const issueData = await linearGraphql<{ issue: { team: { id: string } } | null }>(
          `query IssueTeam($id: String!) { issue(id: $id) { team { id } } }`,
          { id: params.issueId },
        );
        teamId = issueData.issue?.team?.id ?? undefined;
      }
      const stateId = params.stateId ?? (teamId ? await resolveStateId(teamId, params.state) : undefined);
      const assigneeId = params.assigneeId ?? await resolveAssigneeId(params.assignee);
      let projectId = params.projectId;
      if (!projectId && teamId && params.project) {
        projectId = await resolveProjectId(teamId, params.project) ?? undefined;
      }
      const inferredMilestone = params.title ? inferMilestoneNameFromTitle(params.title) : undefined;
      const milestoneInput = params.milestoneId ?? params.milestone ?? inferredMilestone;
      const projectMilestoneId = projectId
        ? await resolveMilestoneId(projectId, milestoneInput, false).catch(() => undefined)
        : undefined;
      const data = await linearMutation<{ issueUpdate: { success: boolean; issue: { id: string; identifier: string; title: string; url: string | null } } }>(
        "issueUpdate",
        `mutation UpdateIssue(
          $id: String!
          $title: String
          $description: String
          $stateId: String
          $assigneeId: String
          $projectMilestoneId: String
          $priority: Int
        ) {
          issueUpdate(
            id: $id
            input: {
              title: $title
              description: $description
              stateId: $stateId
              assigneeId: $assigneeId
              projectMilestoneId: $projectMilestoneId
              priority: $priority
            }
          ) {
            success
            issue { id identifier title url }
          }
        }`,
        {
          id: params.issueId,
          title: params.title,
          description: params.description,
          stateId,
          assigneeId,
          projectMilestoneId,
          priority: params.priority,
        },
      );
      if (!data.issueUpdate.success) throw new Error(`issueUpdate failed for: ${params.issueId}`);
      return { content: [{ type: "text", text: JSON.stringify(data.issueUpdate.issue, null, 2) }], details: {} };
    },
  });

  pi.registerTool({
    name: "linear_create_issues_batch",
    label: "Linear Create Issues Batch",
    description: "Create multiple issues from JSON array.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      if (!params.team || !params.issuesJson) throw new Error("team and issuesJson are required");
      const teamId = await resolveTeamId(params.team);
      const projectId = params.project ? await resolveProjectId(teamId, params.project) : null;

      let issues: BatchIssueInput[] = [];
      try {
        const parsed = JSON.parse(params.issuesJson);
        if (!Array.isArray(parsed)) throw new Error("issuesJson must be a JSON array");
        issues = parsed as BatchIssueInput[];
      } catch (error) {
        throw new Error(`Invalid issuesJson: ${(error as Error).message}`);
      }

      const created: Array<{ id: string; identifier: string; title: string; url: string | null }> = [];
      for (const item of issues) {
        if (!item.title?.trim()) continue;
        const labelIds = await resolveLabelIds(item.labels, teamId);
        const stateId = item.stateId ?? await resolveStateId(teamId, item.state);
        const assigneeId = item.assigneeId ?? await resolveAssigneeId(item.assignee);
        const inferredMilestone = inferMilestoneNameFromTitle(item.title);
        const milestoneInput = item.milestoneId ?? item.milestone ?? inferredMilestone;
        const projectMilestoneId = projectId
          ? await resolveMilestoneId(projectId, milestoneInput, Boolean(milestoneInput))
          : undefined;
        const issue = await createIssue({
          teamId,
          projectId: projectId ?? undefined,
          projectMilestoneId,
          title: item.title.trim(),
          description: item.description,
          priority: item.priority,
          stateId,
          assigneeId,
          labelIds,
        });
        created.push(issue);
      }

      return { content: [{ type: "text", text: JSON.stringify({ createdCount: created.length, created }, null, 2) }], details: { created: created.length } };
    },
  });

  pi.registerTool({
    name: "linear_create_comment",
    label: "Linear Create Comment",
    description: "Create a Linear issue comment by issue UUID.",
    parameters: linearSchema,
    async execute(_id, params: LinearParams) {
      if (!params.issueId || !params.body) throw new Error("issueId and body are required");
      const data = await linearMutation<{ commentCreate: { success: boolean; comment: { id: string; url: string } } }>(
        "commentCreate",
        `mutation Comment($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id url } }
        }`,
        { issueId: params.issueId, body: params.body },
      );
      return { content: [{ type: "text", text: JSON.stringify(data.commentCreate, null, 2) }], details: {} };
    },
  });

  const linearNewHandler = async (args: string, ctx: any) => {
    // CORTE -> Si hay una tarea en vuelo, el nuevo prompt pisaría el contexto
    // y la read-back fallaría. Mejor avisar y dejar que el usuario relance.
    if (!ctx.isIdle()) {
      ctx.ui.notify(
        tf(
          "busy.retry",
          `El agente esta ocupado. Vuelve a lanzar ${slashCommand("linear:new")} cuando termine.`,
          slashCommand("linear:new"),
        ),
        "warning",
      );
      return;
    }
    const brand = loadBrand();
    pi.sendUserMessage(
      visibleLinearAgentPrompt(
        `Ejecuta flujo Linear ${brand.agentName} para: ${args || "(sin argumentos)"}.\n\n` +
        "Reglas obligatorias:\n" +
        "1) Usa team Samuhlodev y assignee me por defecto.\n" +
        "2) Project preflight: lista proyectos (incluye archivados/completados), busca match exacto+fuzzy y reutiliza si existe.\n" +
        "3) Solo crea proyecto si no hay match claro.\n" +
        "4) Milestone gate: lista milestones del proyecto. Si faltan y el usuario pidio organizacion, crealos antes de crear issues.\n" +
        "5) Antes de crear issue, busca duplicados por titulo/keywords en el proyecto.\n" +
        "6) Crea issue con tags [[...]], labels consistentes y milestone acorde (o inferido por codigo M00..M07 en el titulo).\n" +
        "7) Read-back hard gate: verifica title, project, milestone, state, labels y assignee; si falta metadata, actualiza y vuelve a leer.\n\n" +
        "Usa estas tools: linear_list_teams, linear_list_projects, linear_list_milestones, linear_ensure_project_milestones, linear_search_issues, linear_create_project, linear_create_issue, linear_update_issue, linear_get_issue.",
      ),
    );
  };

  pi.registerCommand(commandName("linear:new"), {
    description: t(
      "cmd.linear.new.description",
      "Crea o reutiliza proyecto/issue en Linear con preflight Ein",
    ),
    handler: linearNewHandler,
  });

  pi.registerCommand("linear-new", {
    description: tf(
      "legacy.use",
      `[legacy] Usa ${slashCommand("linear:new")}`,
      slashCommand("linear:new"),
    ),
    handler: linearNewHandler,
  });

  pi.registerCommand(commandName("linear:project-bootstrap"), {
    description: t(
      "cmd.linear.bootstrap.description",
      "Crea/reusa proyecto y siembra issues iniciales por preset",
    ),
    handler: async (args, ctx) => {
      // CORTE -> Mismo guard que linear:new: bootstrap concurrente con otra
      // tarea de Linear corrompería el orden de creación de milestones/issues.
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          tf(
            "busy.retry",
            `El agente esta ocupado. Vuelve a lanzar ${slashCommand("linear:project-bootstrap")} cuando termine.`,
            slashCommand("linear:project-bootstrap"),
          ),
          "warning",
        );
        return;
      }
      const brand = loadBrand();
      const artifactLang = readArtifactLang(ctx.cwd);
      const { projectName, preset } = parseBootstrapArgs(args || "");
      const issues = buildBootstrapIssues(projectName, preset, artifactLang);
      const milestones = buildBootstrapMilestones(preset, artifactLang).map((name) => ({ name }));
      const payload = JSON.stringify(issues);
      const milestonesPayload = JSON.stringify(milestones);
      pi.sendUserMessage(
        visibleLinearBootstrapPrompt(
          `Bootstrap Linear ${brand.agentName}.\n` +
          `Proyecto: ${projectName}\n` +
          `Preset: ${preset}\n\n` +
          "Pasos obligatorios:\n" +
          "1) Reusar proyecto si existe; si no, crearlo en Samuhlodev.\n" +
          "2) Asegurar milestones del preset con linear_ensure_project_milestones.\n" +
          "3) Crear estos issues iniciales con linear_create_issues_batch y asignarlos a milestone.\n" +
          "4) Ejecutar read-back de al menos un issue y validar metadata minima (incluye milestone).\n" +
          "5) Responder con resumen: projectId/url, milestones creados/reusados, cantidad creada, identificadores.\n\n" +
          `milestonesJson:\n${milestonesPayload}\n\n` +
          `issuesJson:\n${payload}`,
        ),
      );
    },
  });

  pi.registerCommand(commandName("linear:milestones"), {
    description: t(
      "cmd.linear.milestones.description",
      "Lista milestones de un proyecto Linear",
    ),
    handler: async (args, ctx) => {
      // CORTE -> listar milestones concurrentemente con un bootstrap en curso
      // daría un snapshot parcial y el usuario no podría confiar en el orden.
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          tf(
            "busy.retry",
            `El agente esta ocupado. Vuelve a lanzar ${slashCommand("linear:milestones")} cuando termine.`,
            slashCommand("linear:milestones"),
          ),
          "warning",
        );
        return;
      }
      pi.sendUserMessage(
        visibleLinearAgentPrompt(
          `Lista milestones para: ${args || "(sin argumentos)"}. ` +
          `Usa linear_list_milestones. Si no hay, responde vacio y recomienda ${slashCommand("linear:project-bootstrap")} o linear_ensure_project_milestones.`,
        ),
      );
    },
  });

  pi.registerCommand(commandName("linear:help"), {
    description: t("cmd.linear.help.description", "Ayuda de workflow Linear Ein"),
    handler: async (_args, ctx) => {
      const brand = loadBrand();
      const fallback = [
        "/// 000. LINEAR HELP",
        `agente: ${brand.agentName}`,
        "",
        "■ 001. COMANDOS",
        `${slashCommand("linear:new")} <request>`,
        `${slashCommand("linear:project-bootstrap")} <proyecto> | <preset>`,
        `${slashCommand("linear:milestones")} <proyecto>`,
        "",
        "■ 002. RUTAS VISIBLES",
        "ein-linear para gestion diaria",
        "ein-linear para arranque, estado y sync diario",
        "ein-linear-bootstrap solo como chain legacy/deprecated manual",
        "",
        "■ 003. PRESETS",
        "front-design, blog-content, ai-system, qa-hardening",
      ].join("\n");
      ctx.ui.notify(
        tf(
          "linear.help",
          fallback,
          brand.agentName,
          slashCommand("linear:new"),
          slashCommand("linear:project-bootstrap"),
          slashCommand("linear:milestones"),
        ),
        "info",
      );
    },
  });
}
