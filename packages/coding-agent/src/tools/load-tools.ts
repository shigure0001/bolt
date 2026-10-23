import { type } from "@oh-my-pi/omptype";
import type { AgentTool, AgentToolResult } from "@oh-my-pi/pi-agent-core";
import { prompt } from "@oh-my-pi/pi-utils";
import loadToolsDescription from "../prompts/tools/load-tools.md" with { type: "text" };
import type { ToolSession } from ".";
import { type DeferredToolEntry, LOAD_TOOLS_TOOL_NAME } from "./deferred-tools";
import { ToolError } from "@oh-my-pi/pi-tui/tools/tool-errors";
import { toolResult } from "./tool-result";

const loadToolsSchema = type({
	names: type("string").array().atLeastLength(1).describe("tool names from the list"),
});

interface LoadToolsDetails {
	loaded: string[];
	meta?: never;
}

/** Activates deferred tools so their schemas ship from the next request on. */
export class LoadToolsTool implements AgentTool<typeof loadToolsSchema, LoadToolsDetails> {
	readonly name = LOAD_TOOLS_TOOL_NAME;
	readonly label = "Load Tools";
	readonly summary = "Load deferred tools so they can be called";
	readonly parameters = loadToolsSchema;
	readonly strict = true;
	readonly approval = "read";
	readonly loadMode = "essential";
	readonly intent = "optional";

	constructor(private readonly session: ToolSession) {}

	get description(): string {
		return prompt.render(loadToolsDescription, { tools: this.session.getDeferredTools?.() ?? [] });
	}

	async execute(
		_toolCallId: string,
		params: typeof loadToolsSchema.infer,
	): Promise<AgentToolResult<LoadToolsDetails>> {
		const load = this.session.loadDeferredTools;
		if (!load) throw new ToolError("No deferred tools are available in this session.");
		// Providers that prefix tool names on the wire (`_wait`) show that spelling; accept it too.
		const deferred = new Set((this.session.getDeferredTools?.() ?? []).map((entry: DeferredToolEntry) => entry.name));
		const isKnown = (name: string) => deferred.has(name) || this.session.isToolActive?.(name) === true;
		const names = params.names.map(name =>
			!isKnown(name) && name.startsWith("_") && isKnown(name.slice(1)) ? name.slice(1) : name,
		);
		const { loaded, alreadyActive, unknown } = await load(names);
		const lines: string[] = [];
		if (loaded.length > 0) lines.push(`Loaded: ${loaded.join(", ")}. Call them directly from your next step.`);
		if (alreadyActive.length > 0) lines.push(`Already available: ${alreadyActive.join(", ")}.`);
		if (unknown.length > 0) {
			const available = (this.session.getDeferredTools?.() ?? []).map((entry: DeferredToolEntry) => entry.name);
			lines.push(
				`Unknown: ${unknown.join(", ")}.${available.length > 0 ? ` Loadable: ${available.join(", ")}.` : ""}`,
			);
		}
		if (loaded.length === 0 && alreadyActive.length === 0) throw new ToolError(lines.join("\n"));
		return toolResult<LoadToolsDetails>({ loaded }).text(lines.join("\n")).done();
	}
}
