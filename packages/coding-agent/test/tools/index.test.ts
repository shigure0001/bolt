import { afterEach, describe, expect, it, vi } from "bun:test";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { createTools, type ToolSession } from "@oh-my-pi/pi-coding-agent/tools";

Bun.env.PI_PYTHON_SKIP_CHECK = "1";

function createTestSession(overrides: Partial<ToolSession> = {}): ToolSession {
	return {
		cwd: "/tmp/test",
		hasUI: false,
		getSessionFile: () => null,
		getSessionSpawns: () => "*",
		settings: Settings.isolated(),
		...overrides,
	};
}

function createSettingsWithOverrides(overrides: Record<string, unknown> = {}): Settings {
	return Settings.isolated({
		"lsp.formatOnWrite": true,
		"bashInterceptor.enabled": true,
		...overrides,
	});
}

function createActiveGoalState() {
	return {
		enabled: true,
		mode: "active" as const,
		goal: {
			id: "goal-1",
			objective: "Ship the release",
			status: "active" as const,
			tokenBudget: 25,
			tokensUsed: 5,
			timeUsedSeconds: 0,
			createdAt: 1,
			updatedAt: 1,
		},
	};
}

describe("createTools", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("creates all builtin tools by default", async () => {
		// xdev mounting is opt-in, so discoverables like lsp and web_search stay
		// top-level in the default builtin set.
		const session = createTestSession({ settings: createSettingsWithOverrides() });
		const tools = await createTools(session);
		const names = tools.map(t => t.name);

		// Core tools should always be present
		expect(names).toContain("eval");
		expect(names).toContain("bash");
		expect(names).toContain("read");
		expect(names).toContain("edit");
		expect(names).toContain("write");
		expect(names).toContain("grep");
		expect(names).toContain("glob");
		expect(names).toContain("lsp");
		expect(names).toContain("task");
		expect(names).toContain("todo");
		expect(names).toContain("web_search");
		expect(names).not.toContain("fetch");
		expect(names).not.toContain("vim");
	});

	it("normalizes legacy explicit tool names", async () => {
		const session = createTestSession();
		const tools = await createTools(session, ["search", "glob", "grep"]);
		const names = tools.map(t => t.name);

		expect(names.filter(name => name === "grep")).toHaveLength(1);
		expect(names).toContain("glob");
		expect(names).not.toContain("search");
	});

	it("hides eval when the Python backend is disabled", async () => {
		const session = createTestSession({ settings: createSettingsWithOverrides({ "eval.py": false }) });
		const tools = await createTools(session);
		const names = tools.map(t => t.name);

		expect(names).toContain("bash");
		expect(names).not.toContain("eval");
	});

	it("keeps eval exposed when the interpreter is missing, so the call reports the backend error", async () => {
		const session = createTestSession();
		vi.spyOn(
			await import("@oh-my-pi/pi-coding-agent/eval/py/kernel"),
			"checkPythonKernelAvailability",
		).mockResolvedValue({
			ok: false,
			reason: "missing python",
		});
		const tools = await createTools(session, ["eval"]);
		const names = tools.map(t => t.name);

		expect(names).toContain("eval");
	});

	it("excludes lsp tool when session disables LSP", async () => {
		const session = createTestSession({ enableLsp: false });
		const tools = await createTools(session, ["read", "lsp", "write"]);
		const names = tools.map(t => t.name);

		expect(names).toEqual(["read", "write"]);
	});

	it("creates xd:// presentation state without remounting explicitly requested built-ins", async () => {
		const session = createTestSession({ settings: createSettingsWithOverrides({ "tools.xdev": true }) });
		const tools = await createTools(session, ["read", "lsp", "write"]);

		expect(session.xdev).toBeDefined();
		expect(session.xdev?.mountedNames.size).toBe(0);
		expect(tools.map(tool => tool.name)).toEqual(["read", "lsp", "write"]);
	});

	it("grants a device-only xd:// transport write when an explicit list keeps read but omits write", async () => {
		// The xd:// transport rides `write xd://<tool>`; with no write at all the
		// session would allocate no xd:// state and later SDK assembly would
		// expose custom/MCP tools top-level. A device-only write restores
		// mounting while filesystem writes stay rejected (see WriteTool).
		const session = createTestSession({ settings: createSettingsWithOverrides({ "tools.xdev": true }) });
		const tools = await createTools(session, ["read", "lsp"]);

		expect(session.deviceOnlyWrite).toBe(true);
		expect(session.xdev).toBeDefined();
		expect(tools.map(tool => tool.name)).toEqual(["read", "lsp", "write"]);
	});

	it("leaves an explicit tool list untouched and allocates no xd:// state by default", async () => {
		const session = createTestSession();
		const tools = await createTools(session, ["read", "lsp"]);

		expect(session.deviceOnlyWrite).toBeUndefined();
		expect(session.xdev).toBeUndefined();
		expect(tools.map(tool => tool.name)).toEqual(["read", "lsp"]);
	});

	it("lowercases requested tool subset", async () => {
		const session = createTestSession();
		const tools = await createTools(session, ["Read", "Write"]);
		const names = tools.map(t => t.name);

		expect(names).toEqual(["read", "write"]);
	});

	it("includes hidden tools when explicitly requested", async () => {
		const session = createTestSession();
		const tools = await createTools(session, ["yield"]);
		const names = tools.map(t => t.name);

		expect(names).toEqual(["yield"]);
	});

	it("includes yield tool when required", async () => {
		const session = createTestSession({ requireYieldTool: true });
		const tools = await createTools(session);
		const names = tools.map(t => t.name);

		expect(names).toContain("yield");
	});

	it("excludes todo from yield sessions", async () => {
		// Todos are parent-owned bookkeeping; a structured subagent never gets them.
		const subagent = await createTools(createTestSession({ requireYieldTool: true }));
		expect(subagent.map(t => t.name)).not.toContain("todo");
	});

	it("excludes ask tool when hasUI is false", async () => {
		const session = createTestSession({ hasUI: false });
		const tools = await createTools(session);
		const names = tools.map(t => t.name);

		expect(names).not.toContain("ask");
	});

	it("includes ask tool when hasUI is true", async () => {
		const session = createTestSession({ hasUI: true });
		const tools = await createTools(session);
		const names = tools.map(t => t.name);

		expect(names).toContain("ask");
	});

	it("excludes ask tool when ask.enabled is false", async () => {
		const session = createTestSession({
			hasUI: true,
			settings: createSettingsWithOverrides({ "ask.enabled": false }),
		});
		const tools = await createTools(session);
		expect(tools.map(t => t.name)).not.toContain("ask");

		const requested = await createTools(
			createTestSession({
				hasUI: true,
				settings: createSettingsWithOverrides({ "ask.enabled": false }),
			}),
			["ask", "read"],
		);
		// No write transport is added: tools.xdev is off by default.
		expect(requested.map(t => t.name)).toEqual(["read"]);
	});

	it("filters disabled builtin tools by settings", async () => {
		const session = createTestSession({
			settings: createSettingsWithOverrides({
				"glob.enabled": false,
				"grep.enabled": false,
				"bash.enabled": false,
				"launch.enabled": false,
				"web_search.enabled": false,
				"browser.enabled": false,
			}),
		});
		const tools = await createTools(session);
		const names = tools.map(t => t.name);

		expect(names).not.toContain("bash");
		expect(names).not.toContain("launch");
		expect(names).not.toContain("glob");
		expect(names).not.toContain("grep");
		expect(names).not.toContain("web_search");
		expect(names).not.toContain("browser");

		const requestedTools = await createTools(createTestSession({ settings: session.settings }), ["bash", "read"]);
		// No write transport is added: tools.xdev is off by default.
		expect(requestedTools.map(t => t.name)).toEqual(["read"]);
	});

	it("auto-includes goal when goal mode is active", async () => {
		const session = createTestSession({
			settings: createSettingsWithOverrides({
				"goal.enabled": true,
			}),
			getGoalModeState: () => createActiveGoalState(),
		});
		const tools = await createTools(session, ["read"]);
		const names = tools.map(t => t.name);

		// No write transport is added: tools.xdev is off by default.
		expect(names).toEqual(["read", "goal"]);
	});

	it("does not widen a restricted explicit tool list for an active goal", async () => {
		const session = createTestSession({
			restrictToolNames: true,
			settings: createSettingsWithOverrides({
				"goal.enabled": true,
			}),
			getGoalModeState: () => createActiveGoalState(),
		});

		const tools = await createTools(session, ["read", "write"]);

		expect(tools.map(tool => tool.name)).toEqual(["read", "write"]);
	});

	it("records active tools on the original session object", async () => {
		const session = createTestSession();

		await createTools(session, ["bash"]);

		expect(session.isToolActive?.("bash")).toBe(true);
		expect(session.isToolActive?.("read")).toBe(false);
	});

	it("grants wait to subagents when explicitly requested", async () => {
		const settings = createSettingsWithOverrides({ "async.enabled": true });
		const main = (await createTools(createTestSession({ settings }), ["read", "wait"])).map(t => t.name);
		const sub = (await createTools(createTestSession({ taskDepth: 1, settings }), ["read", "wait"])).map(t => t.name);
		expect(main).toContain("wait");
		expect(sub).toContain("wait");
	});
});
