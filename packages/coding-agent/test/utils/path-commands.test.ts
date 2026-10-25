import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TempDir } from "@oh-my-pi/pi-utils";
import { findCommandsOnPath } from "../../src/utils/path-commands";

describe("findCommandsOnPath", () => {
	// Regression: a bare Windows install resolves `python` to the App Installer alias,
	// which opens the Microsoft Store instead of running. Listing it sends the model
	// into a dead end; a Store-installed Python in the same folder must still be listed.
	async function probeWithAlias(storePackageInstalled: boolean): Promise<string[]> {
		using temp = TempDir.createSync("@omp-path-commands-");
		const aliasDir = path.join(temp.path(), "Microsoft", "WindowsApps");
		await fs.mkdir(aliasDir, { recursive: true });
		if (storePackageInstalled) {
			await fs.mkdir(path.join(aliasDir, "PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0"));
		}
		const resolved: Record<string, string> = {
			git: path.join(temp.path(), "Git", "cmd", "git.exe"),
			python: path.join(aliasDir, "python.exe"),
			python3: path.join(aliasDir, "python3.exe"),
		};
		return await findCommandsOnPath(command => resolved[command] ?? null);
	}

	it("drops WindowsApps python aliases when no Store Python package is installed", async () => {
		expect(await probeWithAlias(false)).toEqual(["git"]);
	});

	it("keeps WindowsApps python aliases backed by a Store Python package", async () => {
		expect(await probeWithAlias(true)).toEqual(["git", "python", "python3"]);
	});
});
