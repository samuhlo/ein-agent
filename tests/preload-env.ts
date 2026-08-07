import { afterAll } from "bun:test";
import { getRuntimeTestOwner } from "./fixtures/runtime-test-fixture";

const owner = getRuntimeTestOwner();
if (process.env.EIN_FIXTURE_MANUAL_PRELOAD !== "1") {
	afterAll(async () => {
		await owner.dispose();
	});
}
