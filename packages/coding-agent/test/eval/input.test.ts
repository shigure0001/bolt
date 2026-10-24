import { describe, expect, it, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentTool } from "@oh-my-pi/pi-agent-core";
import { ToolError } from "@oh-my-pi/pi-tui/tools/tool-errors";
import { TempDir } from "@oh-my-pi/pi-utils";
import { Settings } from "../../src/config/settings";
import { CursorExecHandlers } from "../../src/cursor";
import { prepareEvalSource } from "../../src/eval/input";
import { disposeKernelSessionsByOwner } from "../../src/eval/py/executor";
import type { ToolSession } from "../../src/tools";
import { EvalTool, type EvalToolParams } from "../../src/tools/eval";

function session(cwd: string): ToolSession {
	return {
		cwd,
		settings: Settings.isolated(),
		hasUI: false,
		getSessionFile: () => null,
		getSessionSpawns: () => null,
	};
}

async function cursorEval(args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
	using tmp = TempDir.createSync("@eval-input-");
	const ownerId = `eval-input-${crypto.randomUUID()}`;
	const context: ToolSession = {
		...session(tmp.path()),
		settings: Settings.isolated({ "eval.autoBackground.enabled": false }),
		getEvalSessionId: () => ownerId,
		getEvalKernelOwnerId: () => ownerId,
	};
	const bridge = new CursorExecHandlers({
		cwd: tmp.path(),
		tools: new Map([["eval", new EvalTool(context) as AgentTool]]),
	});
	try {
		const result = await bridge.mcp({
			name: "eval",
			providerIdentifier: "pi-agent",
			toolName: "eval",
			toolCallId: crypto.randomUUID(),
			args,
			rawArgs: {},
		});
		return {
			isError: result.isError === true,
			text: result.content
				.filter(part => part.type === "text")
				.map(part => part.text)
				.join("\n"),
		};
	} finally {
		await disposeKernelSessionsByOwner(ownerId);
	}
}

describe("eval argument validation", () => {
	it("reports missing code in a Cursor cells-shaped call as an input error", async () => {
		const result = await cursorEval({ cells: [{ language: "py", code: "print(1)" }], timeout: 120 });
		expect(result.isError).toBe(true);
		expect(result.text).toContain('Validation failed for tool "eval"');
		expect(result.text).toContain("code");
	});

	it("refuses invalid input before invoking a proxy executor", async () => {
		const proxyExecutor = mock(async () => ({ content: [], details: undefined }));
		const tool = new EvalTool(null, { proxyExecutor });
		await expect(tool.execute("invalid-proxy", { code: 1 } as unknown as EvalToolParams)).rejects.toBeInstanceOf(
			ToolError,
		);
		expect(proxyExecutor).not.toHaveBeenCalled();
	});

	it("executes a Python cell through Cursor", async () => {
		const result = await cursorEval({ code: 'print("VALID_EVAL")' });
		expect(result.isError).toBe(false);
		expect(result.text).toContain("VALID_EVAL");
	});
});

describe("eval percent commands", () => {
	it("re-reads quoted script paths on each explicit load", async () => {
		using tmp = TempDir.createSync("@eval-source-");
		const file = path.join(tmp.path(), "setup file.py");
		await Bun.write(file, "value = 1");
		const first = await prepareEvalSource('%load "setup file.py"', session(tmp.path()));
		await Bun.write(file, "value = 2");
		const second = await prepareEvalSource('%load "setup file.py"', session(tmp.path()));
		expect(first.code).toBe("value = 1");
		expect(second.code).toBe("value = 2");
		expect(second.filename).toBe(file);
	});

	it("loads Python scripts at the host so the runner gets their filename", async () => {
		using tmp = TempDir.createSync("@eval-source-py-");
		const file = path.join(tmp.path(), "setup.py");
		await Bun.write(file, "value = 1");
		expect(await prepareEvalSource("%load setup.py", session(tmp.path()))).toEqual({
			code: "value = 1",
			filename: file,
		});
	});

	it("loads local URLs from the calling session artifact root instead of the host session", async () => {
		using tmp = TempDir.createSync("@eval-local-source-");
		const context = session(tmp.path());
		context.getArtifactsDir = () => path.join(tmp.path(), "artifacts");
		const sourcePath = path.join(tmp.path(), "artifacts", "local", "setup.py");
		await Bun.write(sourcePath, "value = 42");
		const source = await prepareEvalSource("%load local://setup.py", context);
		expect(source.code).toBe("value = 42");
		expect(source.filename).toBe(await fs.realpath(sourcePath));
	});

	it("leaves Python package installs to the runner's own %pip magic", async () => {
		const code = "%pip install pillow";
		expect(await prepareEvalSource(code, session(process.cwd()))).toEqual({ code });
	});

	it("rejects ambiguous commands and installer flags before installing", async () => {
		const context = session(process.cwd());
		await expect(prepareEvalSource("%load a.py\nrun()", context)).rejects.toThrow(/standalone/);
		await expect(prepareEvalSource('%load "missing.py', context)).rejects.toThrow(/quote/);
		await expect(prepareEvalSource("%load https://example.com/setup.py", context)).rejects.toThrow(/local/);
	});
});
