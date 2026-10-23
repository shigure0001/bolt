/**
 * Deferred tools: enabled and registered, but left off the request until the
 * model names them in `load_tools`. Matching is by the `tools.deferred` glob
 * list; `load_tools` itself is never deferred.
 */

/** Name of the built-in that activates deferred tools. */
export const LOAD_TOOLS_TOOL_NAME = "load_tools";

/** One catalog row shown in the `load_tools` description. */
export interface DeferredToolEntry {
	name: string;
	summary: string;
}

/** Outcome of a `load_tools` call. */
export interface DeferredToolLoadResult {
	loaded: string[];
	alreadyActive: string[];
	unknown: string[];
}

/** Compile `tools.deferred` patterns once, dropping malformed entries. */
export function compileDeferredToolPatterns(patterns: readonly unknown[] | undefined): Bun.Glob[] {
	if (!Array.isArray(patterns)) return [];
	const globs: Bun.Glob[] = [];
	for (const pattern of patterns) {
		if (typeof pattern === "string" && pattern.length > 0) globs.push(new Bun.Glob(pattern));
	}
	return globs;
}

/** Whether `name` matches the deferred patterns. */
export function matchesDeferredToolPattern(name: string, globs: readonly Bun.Glob[]): boolean {
	if (name === LOAD_TOOLS_TOOL_NAME) return false;
	return globs.some(glob => glob.match(name));
}

/** Inputs for {@link applyToolDeferral}. */
export interface ToolDeferralContext {
	globs: readonly Bun.Glob[];
	/** Every registered tool name (the catalog universe). */
	registryNames: Iterable<string>;
	/** Names the model already loaded this session. */
	isLoaded(name: string): boolean;
	/** Names an explicit tool list pinned top-level; never deferred. */
	isPinned(name: string): boolean;
}

/** Whether `name` is currently deferred (matches, not loaded, not pinned). */
export function isToolDeferred(name: string, ctx: ToolDeferralContext): boolean {
	return matchesDeferredToolPattern(name, ctx.globs) && !ctx.isLoaded(name) && !ctx.isPinned(name);
}

/**
 * Filter a requested active set. Deferral only applies when the selection
 * carries `load_tools`: restricted selections (plan mode, explicit lists) that
 * omit it keep every tool they name, since nothing could load them later.
 * `load_tools` is dropped when no registered tool is left to load.
 */
export function applyToolDeferral(names: readonly string[], ctx: ToolDeferralContext): string[] {
	if (!names.includes(LOAD_TOOLS_TOOL_NAME)) return [...names];
	const kept = names.filter(name => !isToolDeferred(name, ctx));
	const keptSet = new Set(kept);
	for (const name of ctx.registryNames) {
		if (!keptSet.has(name) && isToolDeferred(name, ctx)) return kept;
	}
	return kept.filter(name => name !== LOAD_TOOLS_TOOL_NAME);
}
