import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// `sources` y `verified_rev` son el contrato de procedencia de EIN: cada página
// declara de dónde sale y en qué commit se verificó. Van aquí para que el build
// falle si faltan, no solo el linter.
export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({
				sources: z.array(z.string()).optional(),
				verified_rev: z.string().optional(),
			}),
		}),
	}),
};
