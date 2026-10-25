import * as fs from "node:fs/promises";
import * as path from "node:path";
import { $which } from "@oh-my-pi/pi-utils";

/**
 * Commands whose spelling or presence a model otherwise guesses at: interpreters
 * named differently per OS (`python`/`python3`/`py`), JS runtimes and package
 * managers, and common toolchains. The system prompt lists the subset found on
 * PATH so the first command uses a spelling that exists instead of probing.
 */
const PROBED_COMMANDS = [
	"git",
	"gh",
	"python",
	"python3",
	"py",
	"uv",
	"node",
	"npm",
	"pnpm",
	"yarn",
	"bun",
	"deno",
	"cargo",
	"go",
	"java",
	"dotnet",
	"docker",
	"make",
] as const;

const STORE_PYTHON_PACKAGE_PREFIX = "pythonsoftwarefoundation.python.";

/**
 * Windows ships `python.exe`/`python3.exe` App Installer aliases in
 * `%LOCALAPPDATA%\Microsoft\WindowsApps` that only open the Microsoft Store.
 * A Store-installed Python uses the same alias directory but also leaves its
 * `PythonSoftwareFoundation.Python.*` package folder there; without one the
 * alias is the stub.
 */
async function isWindowsStorePythonStub(command: string, resolved: string): Promise<boolean> {
	if (!command.startsWith("python")) return false;
	const dir = path.dirname(resolved);
	if (path.basename(dir).toLowerCase() !== "windowsapps") return false;
	try {
		const entries = await fs.readdir(dir);
		return !entries.some(entry => entry.toLowerCase().startsWith(STORE_PYTHON_PACKAGE_PREFIX));
	} catch {
		// Unreadable alias directory: keep the command rather than hide a working interpreter.
		return false;
	}
}

/** Probed commands that resolve on PATH to something runnable, in probe order. */
export async function findCommandsOnPath(
	which: (command: string) => string | null = command => $which(command),
): Promise<string[]> {
	const results = await Promise.all(
		PROBED_COMMANDS.map(async command => {
			const resolved = which(command);
			if (!resolved || (await isWindowsStorePythonStub(command, resolved))) return undefined;
			return command;
		}),
	);
	return results.filter(command => command !== undefined);
}
