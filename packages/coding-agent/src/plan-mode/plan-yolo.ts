import type { Agent, AgentToolResult } from "@oh-my-pi/pi-agent-core";
import type { Model } from "@oh-my-pi/pi-ai";
import { logger, prompt } from "@oh-my-pi/pi-utils";
import type { Settings } from "../config/settings";
import type { LocalProtocolOptions } from "../internal-urls";
import { resolveApprovedPlan } from "./approved-plan";
import { autosaveApprovedPlan } from "./plan-autosave";
import { listPlanFiles, readPlanFile } from "./plan-files";
import type { PlanModeState } from "./state";
import planYoloHandoffPrompt from "../prompts/system/plan-yolo-handoff.md" with { type: "text" };
import type { ConfiguredThinkingLevel } from "@oh-my-pi/pi-tui/thinking";
import { isMCPToolName } from "../tools/builtin-names";
import {
	replaceTabs,
	shortenEmbeddedPaths,
	shortenPath,
	TRUNCATE_LENGTHS,
	truncateToWidth,
} from "@oh-my-pi/pi-tui/render/render-utils";
import type { PlanProposalHandler } from "../tools/resolve";
import { ToolError } from "@oh-my-pi/pi-tui/tools/tool-errors";
import type { PlanYolo } from "../session/agent-session-types";
import type { SessionManager } from "../session/session-manager";

const PLAN_YOLO_HANDOFF_MESSAGE_TYPE = "plan-yolo-handoff";

/** Capabilities needed to approve a plan and switch to its implementation model. */
export interface PlanYoloHost {
	agent: Agent;
	sessionManager: SessionManager;
	settings: Settings;
	emitNotice(level: "info" | "warning" | "error", message: string, source?: string): void;
	setModelTemporary(
		model: Model,
		thinkingLevel?: ConfiguredThinkingLevel,
		options?: { ephemeral?: boolean },
	): Promise<void>;
	setActiveToolsByName(names: string[]): Promise<void>;
	restoreNonMCPToolPresentation(nonMCPToolNames: string[], nonMCPMountedToolNames: string[]): Promise<void>;
	getEnabledToolNames(): string[];
	getMountedXdevToolNames(): string[];
	hasBuiltInTool(name: string): boolean;
	getPlanModeState(): PlanModeState | undefined;
	setPlanModeState(state: PlanModeState | undefined): void;
	getPlanReferencePath(): string;
	setPlanProposalHandler(handler: PlanProposalHandler | null): void;
	localProtocolOptions(): LocalProtocolOptions;
}

/** Coordinates plan-yolo's read-only plan and automatic implementation handoff. */
export class PlanYoloCoordinator {
	readonly #host: PlanYoloHost;
	#planYolo: PlanYolo | undefined;
	#planYoloPreviousNonMCPPresentation: { enabled: string[]; mounted: string[] } | undefined;
	#planYoloArmed = false;

	constructor(host: PlanYoloHost, planYolo?: PlanYolo) {
		this.#host = host;
		this.#planYolo = planYolo;
	}

	/** Lazily enables plan-yolo's plan phase before the first prompt is built. */
	async armPlanYoloIfNeeded(): Promise<void> {
		if (!this.#planYolo || this.#planYoloArmed) return;
		this.#planYoloArmed = true;
		const previousEnabledTools = this.#host.getEnabledToolNames();
		const previousMountedTools = this.#host.getMountedXdevToolNames();
		const previousPlanModeState = this.#host.getPlanModeState();
		const planModeState: PlanModeState = {
			enabled: true,
			planFilePath: this.#host.getPlanReferencePath() || "local://PLAN.md",
			workflow: "parallel",
		};
		// PlanYolo's injected write is a plan transport, not a user grant. Publish
		// plan mode before applying the tool set so SessionTools keeps an existing
		// device-only write restricted.
		this.#host.setPlanModeState(planModeState);
		// Only the built-in write carries the xd:// propose transport. A shadowing
		// extension `write` would answer every proposal as a file write and the plan
		// phase would never end (#14030), so it is left out of the plan tool set.
		const planTools = this.#host.hasBuiltInTool("write")
			? [...previousEnabledTools, "write"]
			: previousEnabledTools.filter(name => name !== "write");
		try {
			await this.#host.setActiveToolsByName([...new Set(planTools)]);
		} catch (error) {
			this.#host.setPlanModeState(previousPlanModeState);
			this.#planYoloArmed = false;
			throw error;
		}
		this.#planYoloPreviousNonMCPPresentation = {
			enabled: previousEnabledTools.filter(name => !isMCPToolName(name)),
			mounted: previousMountedTools.filter(name => !isMCPToolName(name)),
		};
		this.#host.setPlanProposalHandler(title => this.#finalizePlanYoloProposal(title));
	}

	async #finalizePlanYoloProposal(title: string): Promise<AgentToolResult<unknown>> {
		const planYolo = this.#planYolo;
		const state = this.#host.getPlanModeState();
		if (!planYolo || !state?.enabled) throw new ToolError("Plan mode is not active.");
		const {
			planFilePath,
			planContent,
			title: resolvedTitle,
		} = await resolveApprovedPlan({
			suppliedTitle: title,
			statePlanFilePath: state.planFilePath,
			readPlan: url =>
				readPlanFile(url, {
					localProtocolOptions: this.#host.localProtocolOptions(),
					cwd: this.#host.sessionManager.getCwd(),
				}),
			listPlanFiles: () => listPlanFiles({ localProtocolOptions: this.#host.localProtocolOptions() }),
		});
		let autosavedPlan: string | null = null;
		try {
			autosavedPlan = await autosaveApprovedPlan({
				settings: this.#host.settings,
				cwd: this.#host.sessionManager.getCwd(),
				title: resolvedTitle,
				planContent,
			});
			if (autosavedPlan) {
				const displayPath = truncateToWidth(replaceTabs(shortenPath(autosavedPlan)), TRUNCATE_LENGTHS.CONTENT);
				this.#host.emitNotice("info", `Plan autosaved to ${displayPath}.`, "plan-yolo");
			}
		} catch (error) {
			logger.warn("Failed to autosave approved plan", { error });
			const detail = truncateToWidth(
				shortenEmbeddedPaths(
					replaceTabs(error instanceof Error ? error.message : String(error))
						.replace(/[\r\n]+/g, " ")
						.trim(),
				),
				TRUNCATE_LENGTHS.CONTENT,
			);
			this.#host.emitNotice(
				"warning",
				`Plan autosave failed: ${detail} Continuing with implementation.`,
				"plan-yolo",
			);
		}
		this.#host.setPlanModeState(undefined);
		const previousPresentation = this.#planYoloPreviousNonMCPPresentation;
		try {
			if (previousPresentation) {
				await this.#host.restoreNonMCPToolPresentation(previousPresentation.enabled, previousPresentation.mounted);
			}
		} catch (error) {
			this.#host.setPlanModeState(state);
			throw error;
		}
		this.#host.setPlanProposalHandler(null);
		this.#planYolo = undefined;
		this.#planYoloPreviousNonMCPPresentation = undefined;
		await this.#host.setModelTemporary(planYolo.target, planYolo.thinkingLevel, { ephemeral: true });
		this.#host.emitNotice(
			"info",
			`Plan-yolo: plan approved, switched to ${planYolo.target.provider}/${planYolo.target.id} to implement "${resolvedTitle}".`,
			"plan-yolo",
		);
		this.#host.agent.steer({
			role: "custom",
			customType: PLAN_YOLO_HANDOFF_MESSAGE_TYPE,
			content: prompt.render(planYoloHandoffPrompt, { planFilePath, title: resolvedTitle }),
			attribution: "agent",
			display: false,
			timestamp: Date.now(),
		});
		return {
			content: [{ type: "text", text: `Plan approved. Implementing now with ${planYolo.target.id}.` }],
			details: { planFilePath, title: resolvedTitle, planExists: true },
		};
	}
}
