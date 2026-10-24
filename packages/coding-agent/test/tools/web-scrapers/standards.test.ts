import { describe, expect, it } from "bun:test";
import { handleRfc } from "@oh-my-pi/pi-coding-agent/web/scrapers/rfc";

const SKIP = !Bun.env.WEB_FETCH_INTEGRATION;

describe.skipIf(SKIP)("handleRfc", () => {
	it("returns null for non-RFC URLs", async () => {
		const result = await handleRfc("https://example.com", 20);
		expect(result).toBeNull();
	});

	it("fetches RFC 2616 (HTTP/1.1)", async () => {
		const result = await handleRfc("https://www.rfc-editor.org/rfc/rfc2616", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("rfc");
		expect(result?.content).toContain("HTTP/1.1");
		expect(result?.content).toContain("Hypertext Transfer Protocol");
		expect(result?.contentType).toBe("text/markdown");
	});

	it("fetches RFC 2616 via datatracker URL", async () => {
		const result = await handleRfc("https://datatracker.ietf.org/doc/rfc2616/", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("rfc");
		expect(result?.content).toContain("HTTP/1.1");
	});

	it("fetches RFC 2616 via tools.ietf.org URL", async () => {
		const result = await handleRfc("https://tools.ietf.org/html/rfc2616", 20);
		expect(result).not.toBeNull();
		expect(result?.method).toBe("rfc");
		expect(result?.content).toContain("HTTP/1.1");
	});
});
