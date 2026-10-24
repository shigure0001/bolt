import { ToolError } from "@oh-my-pi/pi-tui/tools/tool-errors";
import { InternalUrlRouter } from "../internal-urls";
import { sessionResolveContext } from "../internal-urls/context";
import type { ToolSession } from "../tools";
import { resolveReadPathAsync } from "../tools/path-utils";
import { throwIfAborted } from "../tools/tool-errors";
import { parseCommandArgs } from "../utils/command-args";

/** A cell's source bytes, resolved before execution. */
export interface PreparedEvalSource {
	code: string;
	filename?: string;
}

/**
 * Resolve standalone percent commands without downloads, execution, or source
 * echo. Python only intercepts `%load` (for internal URL paths); its `%pip`
 * runs through the runner's own magic in the kernel's interpreter.
 */
export async function prepareEvalSource(
	code: string,
	session: ToolSession,
	signal?: AbortSignal,
): Promise<PreparedEvalSource> {
	throwIfAborted(signal);
	const command = /^%load(?:[ \t]+([\s\S]*))?$/.exec(code.trim());
	if (!command) return { code };
	const rawArgs = command[1] ?? "";
	if (/[\r\n]/.test(rawArgs)) {
		throw new ToolError("Use %load as a standalone cell; run subsequent code in another eval call.");
	}
	let args: string[];
	try {
		args = parseCommandArgs(rawArgs, { strict: true });
	} catch (error) {
		throw new ToolError(error instanceof Error ? error.message : String(error));
	}
	const [file] = args;
	if (args.length !== 1 || !file) throw new ToolError("Usage: %load <script path>. Quote paths containing spaces.");
	let filename: string;
	const router = InternalUrlRouter.instance();
	if (router.canHandle(file)) {
		filename = await router.requireLocal(file, "load", sessionResolveContext(session, { signal }));
	} else {
		if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file) && !file.startsWith("file://")) {
			throw new ToolError("Eval scripts must be local. Download and inspect remote scripts before executing them.");
		}
		filename = await resolveReadPathAsync(file, session.cwd);
	}
	let loaded: string;
	try {
		loaded = await Bun.file(filename).text();
	} catch (error) {
		throw new ToolError(`Cannot load eval script ${file}: ${error instanceof Error ? error.message : String(error)}`);
	}
	throwIfAborted(signal);
	return { code: loaded, filename };
}
