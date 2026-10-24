import * as fs from "node:fs";
import * as path from "node:path";

import { getProjectDir, logger } from "@oh-my-pi/pi-utils";
import type { OutputArtifactError } from "@oh-my-pi/pi-tui/tools/streaming-output";
import type { ToolSession } from "../../tools";
import {
	buildManagedKernelEnv,
	buildManagedKernelEnvPatch,
	createCancelledKernelResult,
	executeWithKernelBase,
	getExecutionDeadlineMs,
	getRemainingTimeoutMs,
	isCancellationError,
	isTimedOutCancellation,
	waitForPromiseWithCancellation,
} from "../executor-base";
import type { JsStatusEvent } from "../js/shared/types";
import { getEnabledEvalPreludes } from "../preludes";
import { updateEvalState } from "../state";
import type { EvalDisplayOutput } from "../types";
import {
	createKernelSessionRegistry,
	formatSessionKernelTimeoutAnnotation,
	formatSessionTimeoutAnnotation,
	type KernelSession,
	type KernelSessionRegistryContext,
	normalizeKernelSessionCwd,
	requireRemainingKernelTimeoutMs,
} from "../kernel-session-registry";
import {
	checkPythonKernelAvailability,
	type KernelExecuteOptions,
	type KernelExecuteResult,
	type KernelShutdownResult,
	PythonKernel,
	type PythonPreludeSource,
} from "./kernel";
import { resolveExplicitPythonRuntime } from "./runtime";
import { ensurePyToolBridge } from "./tool-bridge";

export type PythonKernelMode = "session" | "per-call";

export interface PythonExecutorOptions {
	/** Working directory for command execution */
	cwd?: string;
	/** Source filename for file-backed execution and tracebacks. */
	filename?: string;
	/** Timeout in milliseconds */
	timeoutMs?: number;
	/** Absolute wall-clock deadline in milliseconds since epoch */
	deadlineMs?: number;
	/**
	 * Runtime-work budget (ms). Used only for timeout-annotation text when the
	 * caller drives cancellation via the eval watchdog `signal` instead of a
	 * wall-clock `deadlineMs`/`timeoutMs`. Does not arm a timer.
	 */
	idleTimeoutMs?: number;
	/** Callback for streaming output chunks (already sanitized) */
	onChunk?: (chunk: string) => Promise<void> | void;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Session identifier for kernel reuse */
	sessionId?: string;
	/** Logical owner identifier for retained kernel cleanup */
	kernelOwnerId?: string;
	/** Kernel mode (session reuse vs per-call) */
	kernelMode?: PythonKernelMode;
	/**
	 * Explicit interpreter path (`python.interpreter` resolved from the
	 * session's settings). Skips automatic runtime discovery when set.
	 */
	interpreter?: string;
	/** Restart the kernel before executing */
	reset?: boolean;
	/** Session file path for accessing task outputs */
	sessionFile?: string;
	/**
	 * Effective artifacts directory for the current session. Subagents share
	 * the parent's directory, so this can differ from `sessionFile`'s sibling
	 * dir. When present, exported to the kernel as `PI_ARTIFACTS_DIR` and
	 * preferred over `PI_SESSION_FILE`-derived paths.
	 */
	artifactsDir?: string;
	/** Artifact path/id for full output storage */
	artifactPath?: string;
	artifactId?: string;
	/**
	 * On-disk roots the prelude helpers (`read`/`write`) substitute for
	 * internal-URL schemes (e.g. `{ local: "/…/artifacts/local" }`). Exported to
	 * the kernel as `PI_EVAL_LOCAL_ROOTS` (JSON) so `write("local://x")` lands
	 * where `read local://x` resolves instead of a literal `local:/` directory.
	 */
	localRoots?: Record<string, string>;
	/**
	 * ToolSession used to resolve host-side `tool.<name>(args)` calls made from
	 * the Python prelude's bridge proxy. When omitted, the bridge env vars are
	 * not injected and any `tool.foo(...)` raises in Python.
	 */
	toolSession?: ToolSession;
	/** Callback for status events emitted by tool bridge invocations. */
	emitStatus?: (event: JsStatusEvent) => void;
	/**
	 * Live status events streamed as they are emitted (both host-side bridge
	 * helpers like `agent()` and kernel-side `log`/`phase`). Mirrors
	 * what lands in `displayOutputs` so callers can render progress before the
	 * cell finishes.
	 */
	onStatus?: (event: JsStatusEvent) => void;
	/** @internal Bridge session id, set by `executePython` before delegating. */
	bridgeSessionId?: string;
	/** @internal Bridge endpoint info, set by `executePython` before delegating. */
	bridge?: { url: string; token: string };
}

export interface PythonKernelExecutor {
	execute: (code: string, options?: KernelExecuteOptions) => Promise<KernelExecuteResult>;
	syncPreludes?: (
		preludes: readonly PythonPreludeSource[],
		signal: AbortSignal | undefined,
		timeoutMs: number,
	) => Promise<void>;
}

export interface PythonResult {
	/** Combined stdout + stderr output (sanitized, possibly truncated) */
	output: string;
	/** Execution exit code (0 ok, 1 error, undefined if cancelled) */
	exitCode: number | undefined;
	/** Whether the execution was cancelled via signal */
	cancelled: boolean;
	/** Whether the output was truncated */
	truncated: boolean;
	/** Artifact ID if full output was saved to artifact storage */
	artifactId?: string;
	/** Bytes the artifact cap dropped from the saved file's middle (the artifact is a head/tail sample). */
	artifactElidedBytes?: number;
	artifactError?: OutputArtifactError;
	/** Total number of lines in the output stream */
	totalLines: number;
	/** Total number of bytes in the output stream */
	totalBytes: number;
	/** Number of lines included in the output text */
	outputLines: number;
	/** Number of bytes included in the output text */
	outputBytes: number;
	/** Images, views and status events the cell emitted, in order */
	displayOutputs: EvalDisplayOutput[];
	/** Whether stdin was requested */
	stdinRequested: boolean;
}

// ---------------------------------------------------------------------------
// Session bookkeeping
//
// One PythonKernel subprocess per (session id, cwd, interpreter) tuple. The
// runner mutates process-global cwd/sys.path during execution, so cross-directory
// work must never share a live kernel. Multiple agent owners can still register against
// the same tuple; the kernel stays alive until the last owner detaches.
// ---------------------------------------------------------------------------

interface SessionKernelReplacement {
	generation: number;
	deadlineMs?: number;
	promise: Promise<PythonKernel>;
}

interface PythonSession extends KernelSession<PythonKernel> {
	generation: number;
	replacement?: SessionKernelReplacement;
	/** Tool sessions told this session's kernels are alive; each kernel death is reported to all of them. */
	stateSessions: Set<ToolSession>;
	/** Kernel whose death is already wired to `stateSessions`. */
	watchedKernel?: PythonKernel;
}

/**
 * Reports a retained kernel as alive in the eval state registry, so the
 * host-registry reminder lists it, and reports its death once it exits or
 * shuts down (crash, timeout kill, reset, or owner disposal).
 */
function reportKernelAlive(session: PythonSession, kernel: PythonKernel, toolSession: ToolSession | undefined): void {
	if (!toolSession) return;
	session.stateSessions.add(toolSession);
	if (session.watchedKernel !== kernel) {
		session.watchedKernel = kernel;
		void kernel.whenDead().then(() => {
			for (const stateSession of session.stateSessions) {
				updateEvalState(stateSession, { language: "python", kernelId: kernel.id, alive: false });
			}
		});
	}
	updateEvalState(toolSession, {
		language: "python",
		kernelId: kernel.id,
		alive: true,
		interpreter: kernel.pythonPath,
	});
}

function normalizeExplicitInterpreter(cwd: string, interpreter: string | undefined): string {
	if (interpreter === undefined) return "";
	const resolved = resolveExplicitPythonRuntime(interpreter, cwd, {}).pythonPath;
	try {
		return fs.realpathSync.native(resolved);
	} catch {
		return resolved;
	}
}

// ---------------------------------------------------------------------------
// Cancellation plumbing
// ---------------------------------------------------------------------------

class PythonExecutionCancelledError extends Error {
	readonly timedOut: boolean;

	constructor(timedOut: boolean) {
		super(timedOut ? "Command timed out" : "Command aborted");
		this.name = "PythonExecutionCancelledError";
		this.timedOut = timedOut;
	}
}

function requireRemainingTimeoutMs(deadlineMs?: number): number | undefined {
	return requireRemainingKernelTimeoutMs(deadlineMs, PythonExecutionCancelledError);
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

const formatTimeoutAnnotation = formatSessionTimeoutAnnotation;

const formatKernelTimeoutAnnotation = formatSessionKernelTimeoutAnnotation;

function createCancelledPythonResult(timedOut: boolean, timeoutMs?: number): PythonResult {
	const output = timedOut ? (formatTimeoutAnnotation(timeoutMs) ?? "Command timed out") : "";
	return createCancelledKernelResult(output);
}

// ---------------------------------------------------------------------------
// Kernel start helpers
// ---------------------------------------------------------------------------

async function startKernel(cwd: string, options: PythonExecutorOptions): Promise<PythonKernel> {
	requireRemainingTimeoutMs(options.deadlineMs);
	return await PythonKernel.start({
		cwd,
		env: buildManagedKernelEnv(options),
		signal: options.signal,
		deadlineMs: options.deadlineMs,
		interpreter: options.interpreter,
	});
}

async function replaceSessionKernel(
	session: PythonSession,
	cwd: string,
	options: PythonExecutorOptions,
	context: KernelSessionRegistryContext<PythonKernel, PythonExecutorOptions, PythonSession>,
): Promise<PythonKernel> {
	const kernel = session.kernel;
	const generation = session.generation;
	const inFlight = session.replacement;
	if (inFlight?.generation === generation) {
		if (
			inFlight.deadlineMs !== undefined &&
			(options.deadlineMs === undefined || options.deadlineMs > inFlight.deadlineMs)
		) {
			inFlight.deadlineMs = options.deadlineMs;
		}
		return await waitForPromiseWithCancellation(inFlight.promise, options, PythonExecutionCancelledError);
	}
	if (
		context.sessions.get(session.sessionKey) !== session ||
		session.generation !== generation ||
		session.kernel !== kernel
	) {
		throw new PythonExecutionCancelledError(false);
	}

	const deferred = Promise.withResolvers<PythonKernel>();
	const replacement: SessionKernelReplacement = {
		generation,
		deadlineMs: options.deadlineMs,
		promise: deferred.promise,
	};
	session.replacement = replacement;
	void (async () => {
		try {
			const remaining = getRemainingTimeoutMs(options.deadlineMs);
			await kernel
				.shutdown(remaining !== undefined ? { timeoutMs: Math.max(0, remaining) } : undefined)
				.catch(() => undefined);
			if (replacement.deadlineMs !== undefined && replacement.deadlineMs <= Date.now()) {
				throw new PythonExecutionCancelledError(true);
			}
			if (
				context.sessions.get(session.sessionKey) !== session ||
				session.generation !== generation ||
				session.kernel !== kernel
			) {
				throw new PythonExecutionCancelledError(false);
			}
			const next = await startKernel(cwd, {
				...options,
				signal: undefined,
				deadlineMs: undefined,
			});
			if (
				context.sessions.get(session.sessionKey) !== session ||
				session.generation !== generation ||
				session.kernel !== kernel
			) {
				await next.shutdown().catch(() => undefined);
				throw new PythonExecutionCancelledError(false);
			}
			session.kernel = next;
			session.generation += 1;
			deferred.resolve(next);
		} catch (err) {
			deferred.reject(err);
		} finally {
			if (session.replacement === replacement) session.replacement = undefined;
		}
	})();
	return await waitForPromiseWithCancellation(deferred.promise, options, PythonExecutionCancelledError);
}

async function shutdownInvalidatedSession(session: PythonSession): Promise<KernelShutdownResult> {
	const replacement = session.replacement;
	if (replacement) await replacement.promise.catch(() => undefined);
	return await session.kernel.shutdown();
}

async function acquireLiveSessionKernel(
	session: PythonSession,
	cwd: string,
	options: PythonExecutorOptions,
	context: KernelSessionRegistryContext<PythonKernel, PythonExecutorOptions, PythonSession>,
): Promise<PythonKernel> {
	while (context.sessions.get(session.sessionKey) === session) {
		const kernel = session.kernel;
		if (kernel.isAlive()) {
			reportKernelAlive(session, kernel, options.toolSession);
			return kernel;
		}
		await context.replaceSessionKernel(session, cwd, options);
	}
	throw new PythonExecutionCancelledError(false);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function pythonPreludeSources(session: ToolSession | undefined): PythonPreludeSource[] {
	const definitions = getEnabledEvalPreludes(session?.getEvalPreludes?.() ?? []);
	return definitions.flatMap(definition =>
		definition.python.trim().length === 0
			? []
			: [{ name: definition.name, exports: [...definition.exports], source: definition.python }],
	);
}

async function executeWithKernel(
	kernel: PythonKernelExecutor,
	code: string,
	options: PythonExecutorOptions | undefined,
): Promise<PythonResult> {
	const remainingMs = getRemainingTimeoutMs(options?.deadlineMs);
	await kernel.syncPreludes?.(
		pythonPreludeSources(options?.toolSession),
		options?.signal,
		Math.max(1, remainingMs ?? 10_000),
	);
	return executeWithKernelBase<PythonExecutorOptions>({
		kernel,
		code,
		options,
		runIdPrefix: "py",
		errorLogLabel: "Python",
		cancelledErrorClass: PythonExecutionCancelledError,
		buildKernelEnvPatch: buildManagedKernelEnvPatch,
		formatKernelTimeoutAnnotation,
		formatTimeoutAnnotation,
	});
}

async function ensureKernelAvailable(cwd: string, options: PythonExecutorOptions): Promise<void> {
	const availability = await waitForPromiseWithCancellation(
		checkPythonKernelAvailability(cwd, options.interpreter),
		options,
		PythonExecutionCancelledError,
	);
	if (!availability.ok) {
		throw new Error(availability.reason ?? "Python kernel unavailable");
	}
}

async function ensureToolBridge(options: PythonExecutorOptions): Promise<void> {
	if (!options.toolSession || options.bridge) return;
	try {
		options.bridge = await ensurePyToolBridge();
	} catch (err) {
		logger.warn("Failed to start Python tool bridge", {
			error: err instanceof Error ? err.message : String(err),
		});
	}
}

async function executePerCall(code: string, cwd: string, options: PythonExecutorOptions): Promise<PythonResult> {
	if (options.bridge && !options.bridgeSessionId) {
		options.bridgeSessionId = `py-bridge:${crypto.randomUUID()}`;
	}
	const kernel = await startKernel(cwd, options);
	try {
		return await executeWithKernel(kernel, code, { ...options, cwd });
	} finally {
		await kernel.shutdown().catch(() => undefined);
	}
}

const sessionRegistry = createKernelSessionRegistry<PythonKernel, PythonExecutorOptions, PythonResult, PythonSession>({
	languageLabel: "Python",
	cancelledErrorClass: PythonExecutionCancelledError,
	buildSessionKey: (sessionId, cwd, interpreter) => {
		const normalizedCwd = normalizeKernelSessionCwd(cwd);
		return `${sessionId}\0${normalizedCwd}\0${normalizeExplicitInterpreter(normalizedCwd, interpreter)}`;
	},
	createSession: session => ({ ...session, generation: 0, stateSessions: new Set() }),
	startKernel,
	executeWithKernel: async (kernel, code, options) => {
		const result = await executeWithKernel(kernel, code, options);
		// A file-backed cell that completed in a retained kernel loaded that script's definitions.
		if (
			options.toolSession &&
			options.filename &&
			path.isAbsolute(options.filename) &&
			result.exitCode === 0 &&
			kernel.isAlive()
		) {
			updateEvalState(options.toolSession, {
				language: "python",
				kernelId: kernel.id,
				alive: true,
				interpreter: kernel.pythonPath,
				loadedPath: options.filename,
			});
		}
		return result;
	},
	replaceSessionKernel,
	acquireLiveSessionKernel,
	invalidateSession: session => {
		session.generation += 1;
	},
	shutdownSession: session => shutdownInvalidatedSession(session),
	validateKernel: (session, kernel) => session.kernel === kernel,
});

export async function disposeAllKernelSessions(): Promise<void> {
	await sessionRegistry.disposeAll();
}

export async function disposeKernelSessionsByOwner(ownerId: string): Promise<void> {
	await sessionRegistry.disposeByOwner(ownerId);
}

export async function executePythonWithKernel(
	kernel: PythonKernelExecutor,
	code: string,
	options?: PythonExecutorOptions,
): Promise<PythonResult> {
	return await executeWithKernel(kernel, code, options);
}

export async function executePython(code: string, options?: PythonExecutorOptions): Promise<PythonResult> {
	const cwd = normalizeKernelSessionCwd(options?.cwd ?? getProjectDir());
	const deadlineMs = getExecutionDeadlineMs(options);
	const executionOptions: PythonExecutorOptions = {
		...options,
		cwd,
		deadlineMs,
	};

	try {
		requireRemainingTimeoutMs(deadlineMs);
		if (executionOptions.signal?.aborted) {
			throw new PythonExecutionCancelledError(
				isTimedOutCancellation(
					executionOptions.signal.reason,
					PythonExecutionCancelledError,
					executionOptions.signal,
				),
			);
		}
		await ensureKernelAvailable(cwd, executionOptions);
		await ensureToolBridge(executionOptions);

		const kernelMode = executionOptions.kernelMode ?? "session";
		if (kernelMode === "per-call") {
			return await executePerCall(code, cwd, executionOptions);
		}
		return await sessionRegistry.executeOnSession(code, cwd, executionOptions);
	} catch (err) {
		if (isCancellationError(err, PythonExecutionCancelledError) || executionOptions.signal?.aborted) {
			return createCancelledPythonResult(
				isTimedOutCancellation(err, PythonExecutionCancelledError, executionOptions.signal),
			);
		}
		throw err;
	}
}
