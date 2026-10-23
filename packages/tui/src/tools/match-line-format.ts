/**
 * Format a single line of match output for grep/ast-grep style results.
 *
 * Matched lines are prefixed with `*`; context lines are prefixed with a single
 * space. In hashline mode the line uses the editable `LINE:content` shape under
 * a snapshot-tag header and is never padded; in plain mode it keeps the
 * display-only `LINE|content` shape, right-aligning the number to `width` so a
 * file's lines stay in column across digit changes (`* 9|`, ` 10|`).
 */
export function formatMatchLine(
	lineNumber: number,
	line: string,
	isMatch: boolean,
	options: { useHashLines: boolean; width?: number },
): string {
	const marker = isMatch ? "*" : " ";
	if (options.useHashLines) {
		return `${marker}${lineNumber}:${line}`;
	}
	return `${marker}${String(lineNumber).padStart(options.width ?? 0)}|${line}`;
}
