import type { ImageContent, TextContent } from "@oh-my-pi/pi-ai";

/** Extracts text from custom message content. */
export function customMessageContentText(content: string | (TextContent | ImageContent)[]): string {
	if (typeof content === "string") return content;
	const parts: string[] = [];
	for (const part of content) {
		if (part.type === "text") parts.push(part.text);
	}
	return parts.join("\n");
}
