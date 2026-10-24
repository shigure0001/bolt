/** Finished subagent tool calls must reach the task job's widget input source with their intent and result text. */
import { afterEach, describe, expect, it, vi } from "bun:test";
import type { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import type { CreateAgentSessionResult } from "@oh-my-pi/pi-coding-agent/sdk";
import * as sdkModule from "@oh-my-pi/pi-coding-agent/sdk";
import type { AgentSession, AgentSessionEvent } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { runSubprocess, type SubagentToolResult } from "@oh-my-pi/pi-coding-agent/task/executor";
import type { AgentDefinition } from "@oh-my-pi/pi-coding-agent/task/types";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import { createSessionDefaults } from "../helpers/session-defaults";

const agent: AgentDefinition = { name: "task", description: "test", systemPrompt: "test", source: "bundled" };

/** A session double that replays `script` from `prompt()`; the executor reads only this subset. */
function scriptedSession(script: (emit: (event: AgentSessionEvent) => void) => Promise<void>): AgentSession {
	const listeners: Array<(event: AgentSessionEvent) => void> = [];
	const emit = (event: AgentSessionEvent) => {
		for (const listener of listeners.slice()) listener(event);
	};
	let aborted = false;
	const session = {
		...createSessionDefaults(),
		state: { messages: [] },
		agent: { state: { systemPrompt: ["test"] } },
		model: undefined,
		extensionRunner: undefined,
		sessionManager: { appendSessionInit: () => {} },
		getActiveToolNames: () => ["bash", "yield"],
		getEnabledToolNames: () => ["bash", "yield"],
		getToolByName: () => undefined,
		subscribe: (listener: (event: AgentSessionEvent) => void) => {
			listeners.push(listener);
			return () => {
				const index = listeners.indexOf(listener);
				if (index >= 0) listeners.splice(index, 1);
			};
		},
		prompt: async () => {
			await script(emit);
			return true;
		},
		abort: async () => {
			aborted = true;
		},
		isAborted: () => aborted,
	};
	// Structural test double, as in executor-recent-output.test.ts.
	return session as unknown as AgentSession;
}

function toolPair(id: string, toolName: string, intent: string | undefined, text: string): AgentSessionEvent[] {
	return [
		{ type: "tool_execution_start", toolCallId: id, toolName, args: {}, intent },
		{
			type: "tool_execution_end",
			toolCallId: id,
			toolName,
			result: { content: [{ type: "text", text }] },
			isError: false,
		},
	] as AgentSessionEvent[];
}

const yieldEvents = [
	{ type: "tool_execution_start", toolCallId: "final-yield", toolName: "yield", args: {} },
	{
		type: "tool_execution_end",
		toolCallId: "final-yield",
		toolName: "yield",
		result: { content: [{ type: "text", text: "Result submitted." }], details: { status: "success", data: "ok" } },
		isError: false,
	},
] as AgentSessionEvent[];

describe("executor tool results", () => {
	afterEach(() => vi.restoreAllMocks());

	it("reports finished tool calls with their intents and results", async () => {
		const toolResults: SubagentToolResult[] = [];
		const session = scriptedSession(async emit => {
			for (const event of toolPair("bench-1", "bash", "run the decoder bench", "BENCH tok_s=182\nBENCH tok_s=186"))
				emit(event);
			for (const event of yieldEvents) emit(event);
		});
		vi.spyOn(sdkModule, "createAgentSession").mockResolvedValue({ session } as CreateAgentSessionResult);

		const result = await runSubprocess({
			cwd: "/tmp",
			agent,
			task: "bench the decoder",
			description: "tool results",
			index: 0,
			id: `tool-results-${Math.random().toString(36).slice(2)}`,
			settings: Settings.isolated(),
			modelRegistry: { refresh: async () => {} } as ModelRegistry,
			enableLsp: false,
			eventBus: new EventBus(),
			onToolResult: entry => toolResults.push(entry),
		});

		expect(result.exitCode).toBe(0);
		expect(toolResults).toEqual([
			{ tool: "bash", intent: "run the decoder bench", text: "BENCH tok_s=182\nBENCH tok_s=186", isError: false },
			{ tool: "yield", intent: undefined, text: "Result submitted.", isError: false },
		]);
	});
});
