import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ImageContent } from "@oh-my-pi/pi-ai";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import type { ToolSession } from "@oh-my-pi/pi-coding-agent/tools";
import { ReadTool } from "@oh-my-pi/pi-coding-agent/tools/read";
import { removeSyncWithRetries } from "@oh-my-pi/pi-utils";

const TINY_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

function createSession(cwd: string, sourcePath: string): ToolSession {
	const image: ImageContent = { type: "image", data: TINY_PNG_BASE64, mimeType: "image/png" };
	return {
		cwd,
		hasUI: false,
		getSessionFile: () => null,
		getSessionSpawns: () => "*",
		settings: Settings.isolated({ "images.autoResize": false }),
		getImageAttachments: () => [{ label: "Image #1", uri: "attachment://1", image, sourcePath }],
	};
}

describe("read attachment URLs", () => {
	let testDir: string;
	let imagePath: string;

	beforeEach(() => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), "read-attachment-"));
		imagePath = path.join(testDir, "original.png");
		fs.writeFileSync(imagePath, Buffer.from(TINY_PNG_BASE64, "base64"));
	});

	afterEach(() => {
		removeSyncWithRetries(testDir);
	});

	it("decodes attachment URLs through the underlying image file path", async () => {
		const tool = new ReadTool(createSession(testDir, imagePath));
		const attachmentResult = await tool.execute("read-attachment", { path: "attachment://1" });
		const fileResult = await tool.execute("read-file", { path: imagePath });

		expect(attachmentResult.content).toEqual(fileResult.content);
		expect(attachmentResult.content).toContainEqual({
			type: "image",
			data: TINY_PNG_BASE64,
			mimeType: "image/png",
		});
	});

	it("reports unknown attachment URLs with the available URIs", async () => {
		const tool = new ReadTool(createSession(testDir, imagePath));

		await expect(tool.execute("read-missing-attachment", { path: "attachment://2" })).rejects.toThrow(
			"Could not resolve image attachment 'attachment://2'. Available attachment URIs: attachment://1.",
		);
	});
});

describe("read missing-path hints", () => {
	let testDir: string;
	let tool: ReadTool;

	beforeEach(() => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), "read-missing-"));
		fs.mkdirSync(path.join(testDir, "src", "lib"), { recursive: true });
		fs.writeFileSync(path.join(testDir, "src", "foo.tsx"), "x\n");
		fs.writeFileSync(path.join(testDir, "src", "Bar.ts"), "x\n");
		fs.writeFileSync(path.join(testDir, "src", "zzz-unrelated-name.md"), "x\n");
		tool = new ReadTool({
			cwd: testDir,
			hasUI: false,
			getSessionFile: () => null,
			getSessionSpawns: () => "*",
			settings: Settings.isolated(),
		});
	});

	afterEach(() => {
		removeSyncWithRetries(testDir);
	});

	async function readError(target: string): Promise<string> {
		try {
			await tool.execute("read-missing", { path: target });
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
		throw new Error(`read of ${target} unexpectedly succeeded`);
	}

	it("suggests same-stem and one-typo siblings for a mistyped file name", async () => {
		expect(await readError("src/foo.ts")).toBe("Path 'src/foo.ts' not found. Did you mean: src/foo.tsx?");
		expect(await readError("src/Baar.ts")).toBe("Path 'src/Baar.ts' not found. Did you mean: src/Bar.ts?");
	});

	it("names the missing directory and suggests a close sibling directory", async () => {
		expect(await readError("src/lip/a.ts")).toBe(
			"Path 'src/lip/a.ts' not found (directory 'src/lip' does not exist). Did you mean: src/lib/?",
		);
		expect(await readError("nope/deep/a.ts")).toBe(
			"Path 'nope/deep/a.ts' not found (directory 'nope' does not exist)",
		);
	});

	it("says the directory exists but holds nothing similar", async () => {
		expect(await readError("src/qqqqqqqq.py")).toBe(
			"Path 'src/qqqqqqqq.py' not found (nothing similarly named in 'src')",
		);
	});
});
