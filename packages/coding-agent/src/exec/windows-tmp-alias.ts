import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * On Windows the embedded shell maps `/tmp` to `%TEMP%` (as MSYS tools do), but a
 * native program handed the literal `/tmp/x` resolves it against its drive root
 * (`C:\tmp\x`). The command then "works" while reading or writing a different
 * file than the shell sees, outside the working directory. This module detects
 * the write half of that mismatch after a command ran.
 */

/**
 * A `/tmp/...` path written as its own operand or inside a quoted string, not
 * as the tail of a longer path (`./tmp`, `$TMPDIR/tmp`, `~/tmp`) or a remote
 * spec (`host:/tmp/x`).
 */
const TMP_OPERAND_RE = /(?<![\w.~$/:@\\-])\/tmp\/[^\s'"`;,|&<>()\\]+/g;

/** Unique `/tmp/...` paths named in `command`. */
export function findTmpOperands(command: string): string[] {
	return [...new Set(command.match(TMP_OPERAND_RE) ?? [])];
}

/**
 * Native paths under `<root>tmp` that a command naming `/tmp/...` created or
 * modified since `sinceMs`. `roots` are the drive roots a native child could
 * have resolved `/tmp` against (its start and end working directories).
 */
export async function findDriveRootTmpWrites(command: string, roots: string[], sinceMs: number): Promise<string[]> {
	const operands = findTmpOperands(command);
	if (operands.length === 0) return [];
	const candidates = new Set<string>();
	for (const root of new Set(roots)) {
		for (const operand of operands) {
			candidates.add(path.join(root, operand));
		}
	}
	const touched = await Promise.all(
		[...candidates].map(async candidate => {
			try {
				return (await fs.stat(candidate)).mtimeMs >= sinceMs ? candidate : undefined;
			} catch {
				// Missing (the usual case) or unreadable: nothing to report.
				return undefined;
			}
		}),
	);
	return touched.filter(candidate => candidate !== undefined);
}

/** One-line notice naming the stray native paths and the portable spelling. */
export function formatDriveRootTmpNotice(paths: string[]): string {
	return `A native program wrote ${paths.join(", ")}: outside the shell, \`/tmp\` is the drive root's tmp, not the \`$TMPDIR\` the shell maps it to. Pass native programs "$TMPDIR/…" instead.`;
}
