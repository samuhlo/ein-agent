import { describe, expect, test } from "bun:test";
import { refreshManagedRuntimeSurfaces, type RuntimeSurfaceUpgradeEffects } from "../installer/src/core/runtime-surface-upgrade";

function effects(events: string[], failValidation?: "pi" | "claude"): RuntimeSurfaceUpgradeEffects {
	return {
		observe(runtime) {
			events.push(`observe:${runtime}`);
			return { managed: true, markerVersion: "0.91.0-alpha.2" };
		},
		async materialize(runtime) {
			events.push(`materialize:${runtime}`);
		},
		validate(runtime) {
			events.push(`validate:${runtime}`);
			return runtime !== failValidation;
		},
		retire(options) {
			events.push(`retire:${options.target}`);
			return { retired: [], collisions: [], absent: [] };
		},
	};
}

describe("managed runtime surface upgrade", () => {
	test("materializes and validates every selected new surface before retirement", async () => {
		const events: string[] = [];
		const result = await refreshManagedRuntimeSurfaces({ home: "/home/ein", effects: effects(events) });
		expect(result).toEqual({ status: "ok", target: "both", collisions: [] });
		expect(events).toEqual([
			"observe:pi",
			"observe:claude",
			"materialize:pi",
			"validate:pi",
			"materialize:claude",
			"validate:claude",
			"retire:both",
		]);
	});

	test("never retires legacy artifacts after a new-surface failure", async () => {
		const events: string[] = [];
		const result = await refreshManagedRuntimeSurfaces({ home: "/home/ein", effects: effects(events, "claude") });
		expect(result).toMatchObject({ status: "failed", runtime: "claude", reason: "validation-failed" });
		expect(events).not.toContain("retire:both");
	});

	test("does nothing when neither managed marker exists", async () => {
		const events: string[] = [];
		const base = effects(events);
		const result = await refreshManagedRuntimeSurfaces({
			home: "/home/ein",
			effects: { ...base, observe: (runtime) => { events.push(`observe:${runtime}`); return { managed: false, markerVersion: null }; } },
		});
		expect(result).toEqual({ status: "ok", target: null, collisions: [] });
		expect(events).toEqual(["observe:pi", "observe:claude"]);
	});
});

