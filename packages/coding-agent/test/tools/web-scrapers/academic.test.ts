import { describe, expect, it } from "bun:test";
import { handleArxiv } from "@oh-my-pi/pi-coding-agent/web/scrapers/arxiv";

const SKIP = !Bun.env.WEB_FETCH_INTEGRATION;

describe.skipIf(SKIP)("handleArxiv", () => {
	it("fetches a known paper", async () => {
		// "Attention Is All You Need" paper
		const result = await handleArxiv("https://arxiv.org/abs/1706.03762", 30000);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("arxiv");
		expect(result?.contentType).toBe("text/markdown");
		// API may be rate-limited or fail
		if (!result?.content.includes("Too Many Requests") && !result?.content.includes("Failed to fetch")) {
			expect(result?.content).toContain("Attention");
			expect(result?.content).toContain("arXiv:");
			expect(result?.content).toContain("1706.03762");
		}
		expect(result?.truncated).toBe(false);
	});

	it("handles /pdf/ URLs", async () => {
		const result = await handleArxiv("https://arxiv.org/pdf/1706.03762", 30000);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("arxiv");
		if (!result?.content.includes("Too Many Requests") && !result?.content.includes("Failed to fetch")) {
			expect(result?.content).toContain("Attention");
			expect(result?.notes?.some(n => n.includes("PDF"))).toBe(true);
		}
	});

	it("includes paper metadata", async () => {
		const result = await handleArxiv("https://arxiv.org/abs/1706.03762", 30000);
		expect(result).not.toBeNull();
		if (!result?.content.includes("Too Many Requests") && !result?.content.includes("Failed to fetch")) {
			expect(result?.content).toMatch(/Authors:/);
			expect(result?.content).toContain("Vaswani");
			expect(result?.content).toMatch(/Abstract/);
			expect(result?.content).toMatch(/Published:/);
		}
	});
});
