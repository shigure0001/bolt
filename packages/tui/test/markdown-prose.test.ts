import { describe, expect, it } from "bun:test";
import { maskNonProse } from "@oh-my-pi/pi-tui/prompt/markdown-prose";

describe("maskNonProse", () => {
	it("preserves length and leaves plain prose untouched", () => {
		const text = "please orchestrate the rollout across teams";
		expect(maskNonProse(text)).toBe(text);
	});

	it("returns the input unchanged when no code/markup constructs are present", () => {
		// Fast path: no backtick, angle bracket, or tilde fence.
		const text = "a multi line\nmessage with no markup";
		expect(maskNonProse(text)).toBe(text);
	});

	it("blanks fenced code blocks while keeping indices aligned", () => {
		const text = "before\n```\norchestrate\n```\nafter orchestrate";
		const masked = maskNonProse(text);
		expect(masked.length).toBe(text.length);
		// The fenced occurrence is blanked; the prose occurrence survives at its index.
		expect(masked.indexOf("orchestrate")).toBe(text.lastIndexOf("orchestrate"));
		expect(masked.startsWith("before\n")).toBe(true);
	});

	it("blanks tilde fences and language-tagged fences", () => {
		expect(maskNonProse("~~~\norchestrate\n~~~").includes("orchestrate")).toBe(false);
		expect(maskNonProse("```ts\nconst orchestrate = 1\n```").includes("orchestrate")).toBe(false);
	});

	it("treats an unterminated fence as code through end of text", () => {
		expect(maskNonProse("```\norchestrate").includes("orchestrate")).toBe(false);
	});
});
