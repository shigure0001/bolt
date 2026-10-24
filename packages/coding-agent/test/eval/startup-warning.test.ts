import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import * as pyKernel from "@oh-my-pi/pi-coding-agent/eval/py/kernel";
import {
	resolveFirstLaunchPythonEvalWarning,
	resolvePythonEvalWarning,
} from "@oh-my-pi/pi-coding-agent/eval/startup-warning";

const FIX_HINT = "Install Python 3.8+ or set python.interpreter, then verify with `omp setup python --check`.";
const CWD = "/tmp/eval-startup-warning";

let savedPiPy: string | undefined;

function restoreEnv(name: "PI_PY", value: string | undefined): void {
	if (value === undefined) delete Bun.env[name];
	else Bun.env[name] = value;
}

function mockProbe(reason = "Python executable not found on PATH") {
	return vi.spyOn(pyKernel, "checkPythonKernelAvailability").mockResolvedValue({ ok: false, reason });
}

beforeEach(() => {
	savedPiPy = Bun.env.PI_PY;
	delete Bun.env.PI_PY;
});

afterEach(() => {
	vi.restoreAllMocks();
	restoreEnv("PI_PY", savedPiPy);
});

describe("resolvePythonEvalWarning", () => {
	it("reports the eval tool unavailable when Python is missing", async () => {
		mockProbe();
		expect(await resolvePythonEvalWarning({ cwd: CWD, settings: Settings.isolated() })).toBe(
			`Eval tool unavailable: Python executable not found on PATH. ${FIX_HINT}`,
		);
	});

	it("stays silent without probing when Python eval is intentionally disabled", async () => {
		const probe = mockProbe();
		expect(
			await resolvePythonEvalWarning({
				cwd: CWD,
				settings: Settings.isolated({ "eval.py": false }),
			}),
		).toBeUndefined();
		expect(probe).not.toHaveBeenCalled();
	});

	it("shortens home paths, strips control characters, and bounds the probe reason", async () => {
		const interpreter = path.join(os.homedir(), "py\tenv", "python");
		mockProbe(`Tried: ${interpreter} \x1b[31mspawn failed\x1b[0m ${"x".repeat(400)}`);
		const warning = await resolvePythonEvalWarning({ cwd: CWD, settings: Settings.isolated() });
		const reason = warning?.slice(warning.indexOf(": ") + 2, warning.indexOf(". Install"));
		expect(reason).toStartWith("Tried: ~/py");
		expect(reason).not.toContain(os.homedir());
		expect(reason).not.toMatch(/[\t\x1b]/);
		expect(Bun.stringWidth(reason ?? "")).toBeLessThanOrEqual(100);
		expect(warning).toEndWith(FIX_HINT);
	});
});

describe("resolveFirstLaunchPythonEvalWarning", () => {
	const base = { cwd: CWD, settings: Settings.isolated() };

	it("probes on a fresh install and stays silent once the changelog marker exists", async () => {
		const probe = mockProbe();
		expect(
			await resolveFirstLaunchPythonEvalWarning({ ...base, args: {}, lastChangelogVersion: undefined }),
		).toStartWith("Eval tool unavailable");
		expect(
			await resolveFirstLaunchPythonEvalWarning({ ...base, args: {}, lastChangelogVersion: "18.3.5" }),
		).toBeUndefined();
		expect(probe).toHaveBeenCalledTimes(1);
	});

	it("skips resumed launches, which never write the changelog marker", async () => {
		const probe = mockProbe();
		for (const args of [{ continue: true }, { resume: true }, { fromClaude: true }] as const) {
			expect(
				await resolveFirstLaunchPythonEvalWarning({ ...base, args, lastChangelogVersion: undefined }),
			).toBeUndefined();
		}
		expect(probe).not.toHaveBeenCalled();
	});

	it("follows the effective tool list, where an explicit --tools list overrides --no-tools", async () => {
		mockProbe();
		const warn = (args: { tools?: string[]; noTools?: boolean }) =>
			resolveFirstLaunchPythonEvalWarning({ ...base, args, lastChangelogVersion: undefined });
		expect(await warn({ noTools: true, tools: ["eval"] })).toStartWith("Eval tool unavailable");
		expect(await warn({ noTools: true })).toBeUndefined();
		expect(await warn({ tools: ["read"] })).toBeUndefined();
	});
});
