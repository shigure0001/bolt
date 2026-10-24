import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import { $which } from "@oh-my-pi/pi-utils";

interface RunnerFrame {
	type?: string;
	id?: string;
	data?: string;
	status?: string;
	revision?: number;
	digest?: string;
	admissionRejected?: boolean;
}

const pythonPath = Bun.env.PYTHON ?? ($which("python3") ? "python3" : "python");
const runnerPath = path.resolve(import.meta.dir, "../../../src/eval/py/runner.py");
const repoRoot = path.resolve(import.meta.dir, "../../../../..");
const encoder = new TextEncoder();
// The Windows native-import regression below needs a real native extension to
// trigger the loader-lock deadlock (#7985, numpy#24290); a pure-`print` cell
// settles under the broken implementation too. Probe once so the test skips on
// machines without numpy instead of failing the suite.
const numpyAvailable = (() => {
	try {
		const probe = Bun.spawnSync([pythonPath, "-c", "import numpy"], { stdio: ["ignore", "ignore", "ignore"] });
		return probe.exitCode === 0;
	} catch {
		return false;
	}
})();

interface Runner {
	send(req: Record<string, unknown>): void;
	nextFrame(): Promise<RunnerFrame>;
	dispose(): Promise<void>;
}

function spawnRunner(): Runner {
	const proc = Bun.spawn([pythonPath, "-u", runnerPath], {
		cwd: repoRoot,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
	});
	const stderr = new Response(proc.stderr).text();
	const reader = proc.stdout.getReader();
	const decoder = new TextDecoder();
	let pending = "";

	return {
		send(req) {
			proc.stdin.write(encoder.encode(`${JSON.stringify(req)}\n`));
			proc.stdin.flush();
		},
		async nextFrame() {
			while (true) {
				const newline = pending.indexOf("\n");
				if (newline >= 0) {
					const line = pending.slice(0, newline);
					pending = pending.slice(newline + 1);
					return JSON.parse(line) as RunnerFrame;
				}
				const { value, done } = await reader.read();
				if (done) throw new Error(`Python runner exited before frame: ${await stderr}`);
				pending += decoder.decode(value, { stream: true });
			}
		},
		async dispose() {
			try {
				proc.stdin.write(encoder.encode(`${JSON.stringify({ type: "exit" })}\n`));
				proc.stdin.end();
			} catch {
				// stdin may already be closed.
			}
			try {
				reader.releaseLock();
			} catch {
				// Reader may already be released.
			}
			try {
				proc.kill("SIGKILL");
			} catch {
				// Process already exited.
			}
		},
	};
}

async function collectDoneOrder(runner: Runner, ids: Set<string>): Promise<RunnerFrame[]> {
	const dones: RunnerFrame[] = [];
	const seen = new Set<string>();
	while (seen.size < ids.size) {
		const frame = await runner.nextFrame();
		if (frame.type === "done" && frame.id && ids.has(frame.id) && !seen.has(frame.id)) {
			seen.add(frame.id);
			dones.push(frame);
		}
	}
	return dones;
}

// Auto-backgrounded cells, user Python shortcuts, and kernel-defined tool calls
// from subagents can all be in flight on one kernel at once. The runner must keep dispatching sibling
// requests while a cell is parked on a top-level await instead of blocking the
// control channel until it finishes -- the regression that a naive fix for the
// Windows numpy import hang (#7985) would introduce.
describe("Python runner request dispatch", () => {
	it("interleaves a fast request past a slow one parked on a top-level await", async () => {
		if (process.platform === "win32") return; // Windows dispatches serially by design; see _serve_windows.
		const runner = spawnRunner();
		try {
			runner.send({ id: "slow", code: "import asyncio\nawait asyncio.sleep(0.5)\nprint('slow-done')" });
			runner.send({ id: "fast", code: "print('fast-done')" });
			const dones = await collectDoneOrder(runner, new Set(["slow", "fast"]));
			expect(dones.map(frame => frame.id)).toEqual(["fast", "slow"]);
			expect(dones.every(frame => frame.status === "ok")).toBe(true);
		} finally {
			await runner.dispose();
		}
	});
});
