import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Step = Readonly<{ command: string[]; cwd: string }>;

export function localInstallSteps(root: string, args: string[], platform = process.platform, arch = process.arch): Step[] {
	if (!(["darwin", "linux"] as string[]).includes(platform) || !["arm64", "x64"].includes(arch)) {
		throw new Error(`Plataforma local no soportada: ${platform}-${arch}`);
	}
	const installer = join(root, "installer");
	const target = `${platform}-${arch}`;
	const steps: Step[] = [{ command: [process.execPath, "run", "build:all", target], cwd: installer }];
	if (!args.includes("--build-only")) {
		steps.push({ command: [join(installer, "dist", `ein-installer-${target}`), "install", ...args], cwd: root });
	}
	return steps;
}

export async function runLocalInstall(steps: readonly Step[], execute: (step: Step) => Promise<number>): Promise<number> {
	for (const step of steps) {
		const code = await execute(step);
		if (code !== 0) return code;
	}
	return 0;
}

if (import.meta.main) {
	const args = process.argv.slice(2).filter((arg) => arg !== "--");
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`Despliega la rama actual de Ein sin publicar una release.

  bun run dev:install                 Compila e instala en el hogar activo de Ein.
  bun run dev:install --dry-run       Compila y muestra el plan sin instalar.
  bun run dev:install --build-only    Solo genera los binarios locales.

Los demás argumentos se pasan a install: --runtime pi|both, --yes, etc.
Usa bun run setup una vez para preparar las dependencias del checkout.
La instalación utiliza el flujo habitual de backups y conservación de estado.
No cambia la versión del proyecto ni publica tags o releases.
Abre una sesión nueva de Ein después de instalar.`);
	} else {
		try {
			const root = join(dirname(fileURLToPath(import.meta.url)), "..");
			console.log("Ein local: compilando el contenido actual del checkout para esta máquina.");
			process.exitCode = await runLocalInstall(localInstallSteps(root, args), async ({ command, cwd }) => {
				const child = Bun.spawn(command, { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
				return child.exited;
			});
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		}
	}
}
