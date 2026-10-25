/**
 * What a spawned task subagent actually receives from its parent: the repo's
 * AGENTS.md rules in its system prompt (once), and the general agent's tool set.
 * Drives the real executor + session construction against a scripted mock model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { unregisterCustomApis } from "@oh-my-pi/pi-ai/api-registry";
import { createMockModel, registerMockApi } from "@oh-my-pi/pi-ai/providers/mock";
import { closeModelCache } from "@oh-my-pi/pi-catalog/model-cache";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { AgentLifecycleManager } from "@oh-my-pi/pi-coding-agent/registry/agent-lifecycle";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";
import { AgentStorage } from "@oh-my-pi/pi-coding-agent/session/agent-storage";
import { loadProjectContextFiles } from "@oh-my-pi/pi-coding-agent/system-prompt";
import { getBundledAgent } from "@oh-my-pi/pi-coding-agent/task/agents";
import { runSubprocess } from "@oh-my-pi/pi-coding-agent/task/executor";
import { __resetDirsFromEnvForTests, removeWithRetries, setAgentDir } from "@oh-my-pi/pi-utils";
import { createInMemoryAuthStorage } from "../helpers/agent-session-setup";

const MOCK_API_SOURCE = "test/subagent-context-inheritance";
const ENV_KEYS = ["HOME", "PI_CODING_AGENT_DIR", "OMP_PROFILE", "PI_PROFILE"] as const;
const ROOT_MARKER = "ROOT_RULE_MARKER_7f3a";
const NESTED_MARKER = "NESTED_RULE_MARKER_91c2";

let savedEnv: Record<string, string | undefined> = {};
let root: string;
let project: string;

function restoreEnvValue(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		delete Bun.env[key];
		return;
	}
	process.env[key] = value;
	Bun.env[key] = value;
}

beforeEach(async () => {
	savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
	root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-subagent-context-"));
	const home = path.join(root, "home");
	// Project under the fake HOME so discovery never walks into the developer's real config.
	project = path.join(home, "work");
	await fs.mkdir(path.join(project, "packages", "app"), { recursive: true });
	await Bun.write(path.join(project, "AGENTS.md"), `# Repo rules\n${ROOT_MARKER}\n`);
	await Bun.write(path.join(project, "packages", "app", "AGENTS.md"), `# App rules\n${NESTED_MARKER}\n`);
	restoreEnvValue("HOME", home);
	vi.spyOn(os, "homedir").mockReturnValue(home);
	setAgentDir(path.join(home, ".bolt", "agent"));
	AgentRegistry.resetGlobalForTests();
	AgentLifecycleManager.resetGlobalForTests();
	registerMockApi(MOCK_API_SOURCE);
});

afterEach(async () => {
	await AgentLifecycleManager.global().dispose();
	AgentLifecycleManager.resetGlobalForTests();
	AgentRegistry.resetGlobalForTests();
	unregisterCustomApis(MOCK_API_SOURCE);
	vi.restoreAllMocks();
	for (const key of ENV_KEYS) restoreEnvValue(key, savedEnv[key]);
	__resetDirsFromEnvForTests();
	AgentStorage.close();
	closeModelCache();
	await removeWithRetries(root);
});

interface ObservedRequest {
	systemPrompt: string;
	toolNames: string[];
}

/** Runs one bundled-agent spawn and returns what the model saw on its first agent request. */
async function spawnAndObserve(options: {
	agentName: string;
	cwd: string;
	contextFiles?: Array<{ path: string; content: string; depth?: number }>;
}): Promise<ObservedRequest> {
	const authStorage = createInMemoryAuthStorage();
	authStorage.keys.setRuntime("mock", "test-key");
	const modelRegistry = new ModelRegistry(authStorage);
	let observed: ObservedRequest | undefined;
	const mock = createMockModel({
		handler: context => {
			const toolNames = (context.tools ?? []).map(tool => tool.name);
			// Title/label side calls carry no tools; the agent turn always has yield.
			if (!toolNames.includes("yield")) return { content: ["label"] };
			observed ??= { systemPrompt: (context.systemPrompt ?? []).join("\n"), toolNames };
			return { content: [{ type: "toolCall", name: "yield", arguments: { type: "result", data: "done" } }] };
		},
	});
	const catalogAvailable = modelRegistry.getAvailable.bind(modelRegistry);
	vi.spyOn(modelRegistry, "getAvailable").mockImplementation(kind => [mock, ...catalogAvailable(kind)]);
	const agent = getBundledAgent(options.agentName);
	if (!agent) throw new Error(`bundled agent ${options.agentName} missing`);
	const artifactsDir = path.join(root, "artifacts");
	await fs.mkdir(artifactsDir, { recursive: true });
	try {
		const result = await runSubprocess({
			cwd: options.cwd,
			artifactsDir,
			agent,
			task: "report",
			index: 0,
			id: "CtxInherit",
			structured: true,
			modelOverride: "mock/mock-model",
			authStorage,
			modelRegistry,
			contextFiles: options.contextFiles,
			settings: Settings.isolated({
				"task.agentIdleTtlMs": 0,
				"compaction.enabled": false,
				"retry.enabled": false,
				"todo.enabled": true,
				"todo.reminders": false,
				"advisor.enabled": false,
				modelRoles: { default: "mock/mock-model" },
			}),
			enableLsp: false,
			enableMCP: false,
			enableIrc: false,
		});
		expect(result.exitCode).toBe(0);
	} finally {
		authStorage.close();
	}
	if (!observed) throw new Error("mock model never saw an agent request");
	return observed;
}

describe("task subagent inheritance", () => {
	it("renders AGENTS.md rules inherited from the parent exactly once, including nested files", async () => {
		const cwd = path.join(project, "packages", "app");
		const parentContext = await loadProjectContextFiles({ cwd });
		// Sanity: the parent really discovered both rule files.
		expect(parentContext.map(file => path.basename(file.path))).toEqual(["AGENTS.md", "AGENTS.md"]);

		const seen = await spawnAndObserve({ agentName: "task", cwd, contextFiles: parentContext });

		expect(seen.systemPrompt.split(ROOT_MARKER).length - 1).toBe(1);
		expect(seen.systemPrompt.split(NESTED_MARKER).length - 1).toBe(1);
	}, 30_000);

	it("gives the general task agent the core coding tools and wait, but not the parent-owned todo", async () => {
		const seen = await spawnAndObserve({ agentName: "task", cwd: project });

		for (const name of ["read", "grep", "glob", "edit", "write", "bash", "task", "wait", "yield"]) {
			expect(seen.toolNames).toContain(name);
		}
		expect(seen.toolNames).not.toContain("todo");
		// No parent context handed down: the child's own discovery still renders the rules once.
		expect(seen.systemPrompt.split(ROOT_MARKER).length - 1).toBe(1);
	}, 30_000);

	it("keeps the scout read-only without widening its list", async () => {
		const seen = await spawnAndObserve({ agentName: "scout", cwd: project });

		for (const name of ["read", "grep", "glob"]) expect(seen.toolNames).toContain(name);
		for (const name of ["edit", "write", "bash", "task", "todo"]) expect(seen.toolNames).not.toContain(name);
	}, 30_000);
});
