import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getRemoteDir } from "@oh-my-pi/pi-utils";
import type { ToolSession } from "../sdk";
import { findUniqueWorkspaceSuffix, formatPathRelativeToCwd } from "./path-utils";

// Remote mount path prefix (sshfs mounts) - skip fuzzy matching to avoid hangs
const REMOTE_MOUNT_PREFIX = getRemoteDir() + path.sep;
export function isRemoteMountPath(absolutePath: string): boolean {
	return absolutePath.startsWith(REMOTE_MOUNT_PREFIX);
}
export function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const code = (error as { code?: string }).code;
	return code === "ENOENT" || code === "ENOTDIR";
}
/** Per-execute memo of suffix-glob lookups; `null` records a confirmed miss. */
export type SuffixMatchCache = Map<string, { absolutePath: string; displayPath: string } | null>;
/**
 * Memoized {@link findUniqueWorkspaceSuffix} for a single read call. A missing
 * path with archive/sqlite extensions probes the workspace once per stage
 * (archive candidates, sqlite candidates, plain path) — each glob carries a
 * 5s timeout, so repeated lookups of the same string stack into a long
 * stall before erroring. The cache collapses repeats within one execute().
 */
export async function findSuffixMatchCached(
	session: ToolSession,
	cache: SuffixMatchCache,
	rawPath: string,
	signal?: AbortSignal,
): Promise<{ absolutePath: string; displayPath: string } | null> {
	const hit = cache.get(rawPath);
	if (hit !== undefined) return hit;
	const result = await findUniqueWorkspaceSuffix(rawPath, session.cwd, signal);
	cache.set(rawPath, result);
	return result;
}

const MISSING_PATH_SCAN_CAP = 2000;
const MISSING_PATH_MAX_SUGGESTIONS = 3;

/** Levenshtein distance, or `max + 1` as soon as it provably exceeds `max`. */
function boundedEditDistance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		let rowMin = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
			const value = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
			row.push(value);
			if (value < rowMin) rowMin = value;
		}
		if (rowMin > max) return max + 1;
		prev = row;
	}
	return prev[b.length]!;
}

function stemOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(0, dot) : name;
}

/** Lower is closer; `undefined` means unrelated. Names are compared case-insensitively. */
function nameSimilarityRank(target: string, candidate: string): number | undefined {
	const t = target.toLowerCase();
	const c = candidate.toLowerCase();
	if (t === c) return 0;
	if (stemOf(t) === stemOf(c)) return 1;
	const max = Math.max(1, Math.min(3, Math.floor(t.length / 4)));
	const distance = boundedEditDistance(t, c, max);
	if (distance <= max) return 1 + distance;
	if (Math.min(t.length, c.length) >= 3 && (c.startsWith(t) || t.startsWith(c))) return 5;
	return undefined;
}

/**
 * Hint text appended to a `Path '…' not found` error. Walks up to the nearest
 * existing ancestor, names the first missing directory (or a file used as a
 * directory), and suggests up to three similarly named siblings from a single
 * capped directory scan. Returns `""` when nothing useful is known.
 */
export async function describeMissingPath(absolutePath: string, cwd: string): Promise<string> {
	try {
		const target = path.resolve(absolutePath);
		if (isRemoteMountPath(target)) return "";
		let missingChild = target;
		let ancestor = path.dirname(target);
		for (;;) {
			let isDirectory: boolean;
			try {
				isDirectory = (await fs.stat(ancestor)).isDirectory();
			} catch (error) {
				const up = path.dirname(ancestor);
				if (!isNotFoundError(error) || up === ancestor) return "";
				missingChild = ancestor;
				ancestor = up;
				continue;
			}
			if (!isDirectory) return ` ('${formatPathRelativeToCwd(ancestor, cwd)}' is a file, not a directory)`;
			break;
		}

		const directoryMissing = missingChild !== target;
		const wanted = path.basename(missingChild);
		const ranked: Array<{ rank: number; display: string }> = [];
		const dir = await fs.opendir(ancestor);
		let scanned = 0;
		for await (const entry of dir) {
			if (++scanned > MISSING_PATH_SCAN_CAP) break;
			const isDir = entry.isDirectory() || entry.isSymbolicLink();
			if (directoryMissing && !isDir) continue;
			const rank = nameSimilarityRank(wanted, entry.name);
			if (rank === undefined) continue;
			const display = formatPathRelativeToCwd(path.join(ancestor, entry.name), cwd, {
				trailingSlash: entry.isDirectory(),
			});
			ranked.push({ rank, display });
		}
		ranked.sort((a, b) => a.rank - b.rank || (a.display < b.display ? -1 : a.display > b.display ? 1 : 0));
		const note = directoryMissing
			? ` (directory '${formatPathRelativeToCwd(missingChild, cwd)}' does not exist)`
			: "";
		if (ranked.length === 0) {
			if (directoryMissing) return note;
			const where = formatPathRelativeToCwd(ancestor, cwd);
			return ` (nothing similarly named in ${where === "." ? "the working directory" : `'${where}'`})`;
		}
		const names = ranked.slice(0, MISSING_PATH_MAX_SUGGESTIONS).map(item => item.display);
		return `${note}. Did you mean: ${names.join(", ")}?`;
	} catch {
		return "";
	}
}
