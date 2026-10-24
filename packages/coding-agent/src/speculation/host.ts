import type {
	SpeculativeAuthorization,
	SpeculativeExecutionHost,
	SpeculativeLaunchContext,
	SpeculativeToolExecutionConfig,
	SpeculativeToolReference,
} from "@oh-my-pi/pi-agent-core";
import type { Settings } from "../config/settings";
import type { ToolSession } from "../tools";
import { resolveApproval } from "../tools/approval";
import { getApprovalGrants } from "../tools/approval-cache";
import { cfgTaskSpeculativeLaunch } from "../task/settings";
import { cfgToolsApproval, cfgToolsApprovalMode } from "../tools/settings";

export interface SpeculationLifecycle {
	hasHandlers(eventType: string): boolean;
}

function hasLifecycleHandlers(runner: SpeculationLifecycle): boolean {
	return (
		runner.hasHandlers("tool_call") ||
		runner.hasHandlers("tool_result") ||
		runner.hasHandlers("tool_approval_requested") ||
		runner.hasHandlers("tool_approval_resolved")
	);
}

/**
 * Session-scoped policy boundary for streamed `task` launches.
 *
 * The loop only starts a subagent early when this host authorizes it: ordinary
 * approval and extension lifecycle hooks stay authoritative, so work a handler
 * could block or a user must approve never starts before the call is final.
 */
export class CodingAgentSpeculativeExecutionHost implements SpeculativeExecutionHost {
	constructor(
		private readonly settings: Settings,
		private readonly toolSession: ToolSession,
		private readonly extensionRunner: SpeculationLifecycle,
	) {}

	/** Only streamed `task` launches are speculative; no direct tool call is authorized. */
	authorize(): SpeculativeAuthorization {
		return { allowed: false, reason: "direct speculative execution is disabled" };
	}

	authorizeLaunch(context: SpeculativeLaunchContext): SpeculativeAuthorization {
		return this.#policyGate(context.tool, context.args);
	}

	/** Extension lifecycle handlers and non-auto-allow approval both veto early execution. */
	#policyGate(tool: SpeculativeToolReference, args: unknown): SpeculativeAuthorization {
		if (hasLifecycleHandlers(this.extensionRunner)) {
			return { allowed: false, reason: "active extension lifecycle handler" };
		}
		const approval = resolveApproval(
			tool,
			args,
			cfgToolsApprovalMode.get(this.settings),
			cfgToolsApproval.get(this.settings),
			getApprovalGrants(this.settings.getAgentDir(), this.toolSession.sessionManager?.getSessionId?.()),
		);
		if (approval.policy !== "allow") return { allowed: false, reason: "tool approval is not auto-allow" };
		return { allowed: true };
	}
}

/**
 * Session-scoped speculative execution config with live settings reads.
 *
 * The Agent captures its config once at construction, so a one-shot
 * `{ enabled }` object strands mid-session toggles. A getter re-reads
 * `task.speculativeLaunch` per turn; the single host stays for the session.
 */
export function createSpeculativeToolExecutionConfig(
	settings: Settings,
	toolSession: ToolSession,
	extensionRunner: SpeculationLifecycle,
): SpeculativeToolExecutionConfig {
	const host = new CodingAgentSpeculativeExecutionHost(settings, toolSession, extensionRunner);
	return {
		get enabled() {
			return cfgTaskSpeculativeLaunch.get(settings);
		},
		host,
	};
}
