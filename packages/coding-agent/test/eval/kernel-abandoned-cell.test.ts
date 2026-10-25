import { afterEach, describe, expect, test } from "bun:test";
import { ToolError } from "@oh-my-pi/pi-tui/tools/tool-errors";
import { BaseKernel } from "../../src/eval/kernel-base";

// A runner that speaks the NDJSON frame protocol. The request "stuck" ignores every interrupt and
// only reports `done` once a `release` request arrives; any other request settles immediately.
const FAKE_RUNNER = `
let buf = "";
let stuckId;
const emit = frame => process.stdout.write(JSON.stringify(frame) + "\\n");
const done = id => emit({ type: "done", id, status: "ok", executionCount: 1, cancelled: false });
process.stdin.on("data", chunk => {
	buf += chunk;
	let nl;
	while ((nl = buf.indexOf("\\n")) >= 0) {
		const req = JSON.parse(buf.slice(0, nl));
		buf = buf.slice(nl + 1);
		if (req.type === "exit") process.exit(0);
		if (req.type === "release") {
			done(stuckId);
			done(req.id);
			continue;
		}
		emit({ type: "started", id: req.id });
		if (req.code === "stuck") stuckId = req.id;
		else {
			emit({ type: "stdout", id: req.id, data: "ran " + req.code + "\\n" });
			done(req.id);
		}
	}
});
`;

class AbandonTestKernel extends BaseKernel {
	readonly interrupts: string[] = [];

	constructor() {
		super("abandoned-cell-test", {
			languageName: "Test",
			traceIpc: false,
			exitPayload: JSON.stringify({ type: "exit" }),
			interruptEscalationMs: 20,
			lateDoneWaitMs: 20,
			shutdownGraceMs: 1_000,
			buildPayload: (code, msgId) => JSON.stringify({ id: msgId, code }),
			// Stands in for a runner that cannot be interrupted: record the request, deliver nothing.
			interruptRequest: msgId => {
				this.interrupts.push(msgId);
			},
		});
	}

	/** Let the stuck cell finish; resolves once its late `done` has been read. */
	async release(): Promise<void> {
		await this.submitRequest("release-1", JSON.stringify({ type: "release", id: "release-1" }));
	}
}

// These tests exercise the kernel's real interrupt-escalation and busy-wait timers against a live
// subprocess; fake timers cannot advance a child process, so the (millisecond-scale) delays are real.
describe("BaseKernel cell that ignores its interrupt", () => {
	let kernel: AbandonTestKernel | undefined;

	afterEach(async () => {
		await kernel?.shutdown({ timeoutMs: 1_000 });
		kernel = undefined;
	});

	function start(): AbandonTestKernel {
		const created = new AbandonTestKernel();
		created.setProcess(
			Bun.spawn([process.execPath, "-e", FAKE_RUNNER], { stdin: "pipe", stdout: "pipe", stderr: "pipe" }),
		);
		kernel = created;
		return created;
	}

	test("releases a timed-out cell without killing the kernel, then refuses new cells until it finishes", async () => {
		const active = start();

		const timedOut = await active.execute("stuck", { id: "stuck-1", timeoutMs: 10 });
		expect(timedOut.cancelled).toBe(true);
		expect(timedOut.timedOut).toBe(true);
		expect(timedOut.kernelKilled).toBe(false);
		expect(active.isAlive()).toBe(true);
		expect(active.isBusy()).toBe(true);
		expect(active.interrupts).toEqual(["stuck-1"]);

		// The cell is still running: a new cell must fail loudly instead of queueing or killing the kernel.
		const refused = await active.execute("next").catch((err: unknown) => err);
		expect(refused).toBeInstanceOf(ToolError);
		expect((refused as ToolError).message).toContain("reset: true");
		expect(active.isAlive()).toBe(true);

		// The late `done` frame is absorbed and the same kernel accepts work again.
		await active.release();
		expect(active.isBusy()).toBe(false);
		const chunks: string[] = [];
		const next = await active.execute("next", { onChunk: text => void chunks.push(text) });
		expect(next.status).toBe("ok");
		expect(next.cancelled).toBe(false);
		expect(chunks.join("")).toContain("ran next");
	});

	test("a cell cancelled by its caller is released the same way", async () => {
		const active = start();
		const controller = new AbortController();
		const pending = active.execute("stuck", { id: "stuck-2", signal: controller.signal });
		controller.abort(new DOMException("user cancelled", "AbortError"));
		const result = await pending;
		expect(result.cancelled).toBe(true);
		expect(result.timedOut).toBe(false);
		expect(result.kernelKilled).toBe(false);
		expect(active.isAlive()).toBe(true);
		await active.release();
		expect(active.isBusy()).toBe(false);
	});
});
