import { describe, expect, it } from "bun:test";
import {
	applyToolDeferral,
	compileDeferredToolPatterns,
	LOAD_TOOLS_TOOL_NAME,
	type ToolDeferralContext,
} from "../../src/tools/deferred-tools";
import type { Tool } from "../../src/tools/index";
import { promptCatalogSummary } from "../../src/tools/xdev";

function ctx(overrides: Partial<ToolDeferralContext> = {}): ToolDeferralContext {
	return {
		globs: compileDeferredToolPatterns(["task", "lsp", "mcp__*"]),
		registryNames: ["read", "bash", "task", "lsp", "mcp__ddg_search", LOAD_TOOLS_TOOL_NAME],
		isLoaded: () => false,
		isPinned: () => false,
		...overrides,
	};
}

describe("applyToolDeferral", () => {
	it("holds back matching tools, including MCP globs, while load_tools stays", () => {
		const names = ["read", "bash", "task", "lsp", "mcp__ddg_search", LOAD_TOOLS_TOOL_NAME];
		expect(applyToolDeferral(names, ctx())).toEqual(["read", "bash", LOAD_TOOLS_TOOL_NAME]);
	});

	it("leaves selections without load_tools untouched, since nothing could load them later", () => {
		const planMode = ["read", "lsp", "task"];
		expect(applyToolDeferral(planMode, ctx())).toEqual(planMode);
	});

	it("keeps loaded and explicitly pinned tools active", () => {
		const names = ["read", "task", "lsp", LOAD_TOOLS_TOOL_NAME];
		const result = applyToolDeferral(
			names,
			ctx({ isLoaded: name => name === "task", isPinned: name => name === "lsp" }),
		);
		expect(result).toContain("task");
		expect(result).toContain("lsp");
		// mcp__ddg_search is still loadable, so load_tools remains.
		expect(result).toContain(LOAD_TOOLS_TOOL_NAME);
	});

	it("drops load_tools once nothing is left to load", () => {
		const names = ["read", "task", "lsp", "mcp__ddg_search", LOAD_TOOLS_TOOL_NAME];
		const everythingLoaded = ctx({ isLoaded: () => true });
		expect(applyToolDeferral(names, everythingLoaded)).toEqual(["read", "task", "lsp", "mcp__ddg_search"]);
	});

	it("never defers load_tools itself even if a pattern matches it", () => {
		const names = ["read", "task", LOAD_TOOLS_TOOL_NAME];
		const greedy = ctx({ globs: compileDeferredToolPatterns(["*_tools", "task"]) });
		expect(applyToolDeferral(names, greedy)).toEqual(["read", LOAD_TOOLS_TOOL_NAME]);
	});
});

describe("promptCatalogSummary", () => {
	const summaryOf = (description: string, max = 80) =>
		promptCatalogSummary({ name: "t", description } as unknown as Tool, max);

	it("cuts at the last clause end instead of mid-word", () => {
		const out = summaryOf("Execute Python or JavaScript in persistent kernels; load scripts or install packages on demand");
		expect(out).toBe("Execute Python or JavaScript in persistent kernels");
	});

	it("keeps whole sentences and ignores abbreviation dots", () => {
		expect(summaryOf("Search the web for pages. Returns ranked results with titles and urls for every hit found")).toBe(
			"Search the web for pages.",
		);
		const abbreviated = summaryOf("Fetch a page and convert it to markdown, e.g. for reading docs and articles online today");
		expect(abbreviated.endsWith("e.g.")).toBe(false);
	});

	it("falls back to a word boundary with an ellipsis, within the byte budget", () => {
		const words = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau";
		const out = summaryOf(words, 40);
		expect(out.endsWith("…")).toBe(true);
		expect(Buffer.byteLength(out)).toBeLessThanOrEqual(40);
		expect(words.startsWith(out.slice(0, -1))).toBe(true);
		expect(words[out.length - 1]).toBe(" ");
	});

	it("returns short summaries untouched", () => {
		expect(summaryOf("Read files")).toBe("Read files");
	});
});
