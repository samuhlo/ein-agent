// =============================================================================
// TESTS: install.sh — detección WSL
// WSL es Linux: la build linux-x64 + la rama /dev/tty ya funcionan dentro de
// WSL. El instalador solo lo detecta para avisar al usuario de Windows. Este
// test evita que la detección se pierda en un refactor.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sh = readFileSync(
	join(import.meta.dir, "../installer/install.sh"),
	"utf8",
);

describe("install.sh WSL", () => {
	test("detecta WSL (/proc/version o WSL_DISTRO_NAME)", () => {
		expect(sh).toMatch(/proc\/version|WSL_DISTRO_NAME/);
	});

	test("la rama linux + /dev/tty sigue intacta (WSL la usa)", () => {
		expect(sh).toContain('"$OS" = "linux"');
		expect(sh).toContain("/dev/tty");
	});
});
