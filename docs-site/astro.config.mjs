import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
	site: "https://samuhlo.github.io",
	base: "/ein-agent",
	integrations: [
		starlight({
			title: "EIN",
			description: "Multi-agent coding harness. Trabajo ambiguo en cambios pequeños, explicados y verificados.",
			defaultLocale: "root",
			locales: { root: { label: "Español", lang: "es" } },
			social: [{ icon: "github", label: "GitHub", href: "https://github.com/samuhlo/ein-agent" }],
			customCss: ["./src/styles/ein.css"],
			components: {
				Head: "./src/components/Head.astro",
				Header: "./src/components/Header.astro",
				Sidebar: "./src/components/Sidebar.astro",
				Pagination: "./src/components/Pagination.astro",
			},
			sidebar: [
				{ label: "00 · START", items: [{ autogenerate: { directory: "00-start" } }] },
				{ label: "01 · CONCEPTS", items: [{ autogenerate: { directory: "01-concepts" } }] },
				{ label: "02 · WORKFLOW", items: [{ autogenerate: { directory: "02-workflow" } }] },
				{ label: "03 · RUNTIMES", items: [{ autogenerate: { directory: "03-runtimes" } }] },
				{ label: "04 · REFERENCE", items: [{ autogenerate: { directory: "04-reference" } }] },
				{ label: "05 · DEBUG", items: [{ autogenerate: { directory: "05-debug" } }] },
			],
		}),
	],
});
