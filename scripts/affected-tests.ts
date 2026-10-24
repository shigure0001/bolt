#!/usr/bin/env bun
/**
 * Run only the TypeScript test files affected by the working-tree changes.
 *
 * Selection walks the real module graph: every test file's imports are scanned
 * with Bun's transpiler and resolved with Bun's resolver (workspace aliases,
 * package `exports`, `with { type: "text" }` prompt imports), and a test is
 * selected when any changed file is in its transitive closure. Changes the
 * graph cannot see are mapped conservatively:
 * - Rust crates and native addons select every test reaching `@oh-my-pi/pi-natives`.
 * - `package.json`, `bunfig.toml` and `tsconfig*.json` select the whole package.
 * - Any other non-graph file (fixtures read at runtime) selects tests whose
 *   source mentions its file name.
 *
 * Usage:
 *   bun scripts/affected-tests.ts [--base <ref> | --files <a,b>] [--list] [--parallel <n>] [--all] [-- <bun test args>]
 *
 * `--base` diffs against a ref (default: HEAD plus untracked files); `--files`
 * names the changed files directly. `--list` prints the selection without
 * running it. `--all` runs every test file with the same fast settings.
 * Per-package timings are kept under `node_modules/.cache/affected-tests/` so
 * the slowest files start first.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const passthroughIndex = args.indexOf("--");
const ownArgs = passthroughIndex >= 0 ? args.slice(0, passthroughIndex) : args;
const passthrough = passthroughIndex >= 0 ? args.slice(passthroughIndex + 1) : [];

function flagValue(name: string): string | undefined {
	const index = ownArgs.indexOf(name);
	return index >= 0 ? ownArgs[index + 1] : undefined;
}

const baseRef = flagValue("--base");
const listOnly = ownArgs.includes("--list");
const runAll = ownArgs.includes("--all");
const parallel = Number(flagValue("--parallel") ?? Math.max(1, os.availableParallelism()));
// Windows caps a command line near 32k characters; batches of relative paths stay well under it.
const BATCH_SIZE = 400;

const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;

function toPosix(file: string): string {
	return file.replaceAll("\\", "/");
}

async function git(argv: string[]): Promise<string[]> {
	const proc = Bun.spawn(["git", ...argv], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
	const out = await new Response(proc.stdout).text();
	if ((await proc.exited) !== 0) throw new Error(`git ${argv.join(" ")} failed`);
	return out
		.split("\n")
		.map(line => line.trim())
		.filter(Boolean);
}

async function changedFiles(): Promise<string[]> {
	const explicit = flagValue("--files");
	if (explicit) return explicit.split(",").map(file => toPosix(path.resolve(repoRoot, file.trim())));
	const tracked = await git(["diff", "--name-only", baseRef ?? "HEAD"]);
	const untracked = await git(["ls-files", "--others", "--exclude-standard"]);
	return [...new Set([...tracked, ...untracked])].map(file => toPosix(path.join(repoRoot, file)));
}

interface TestPackage {
	dir: string;
	tests: string[];
}

async function discoverTestPackages(): Promise<TestPackage[]> {
	const packages: TestPackage[] = [];
	for (const entry of fs.readdirSync(path.join(repoRoot, "packages"), { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const dir = toPosix(path.join(repoRoot, "packages", entry.name));
		if (!fs.existsSync(path.join(dir, "package.json"))) continue;
		const tests: string[] = [];
		for await (const file of new Bun.Glob("{test,src}/**/*.test.{ts,tsx,js,mjs}").scan({ cwd: dir })) {
			tests.push(toPosix(path.join(dir, file)));
		}
		if (tests.length > 0) packages.push({ dir, tests: tests.sort() });
	}
	return packages;
}

const transpilers = {
	ts: new Bun.Transpiler({ loader: "ts" }),
	tsx: new Bun.Transpiler({ loader: "tsx" }),
};

/** Resolved local (non-node_modules) imports of one source file. */
function localImports(file: string): string[] {
	let source: string;
	try {
		source = fs.readFileSync(file, "utf8");
	} catch {
		return [];
	}
	let specifiers: string[];
	try {
		const transpiler = file.endsWith("x") ? transpilers.tsx : transpilers.ts;
		specifiers = transpiler.scanImports(source).map(entry => entry.path);
	} catch {
		return [];
	}
	const out: string[] = [];
	const fromDir = path.dirname(file);
	for (const specifier of specifiers) {
		if (specifier.startsWith("node:") || specifier.startsWith("bun:")) continue;
		let resolved: string;
		try {
			resolved = toPosix(Bun.resolveSync(specifier, fromDir));
		} catch {
			continue;
		}
		if (!path.isAbsolute(resolved)) continue;
		const real = toPosix(fs.realpathSync(resolved));
		if (!real.startsWith(toPosix(repoRoot)) || real.includes("/node_modules/")) continue;
		out.push(real);
	}
	return out;
}

/** Reverse import graph over everything reachable from the given test files. */
function buildReverseGraph(tests: string[]): Map<string, Set<string>> {
	const reverse = new Map<string, Set<string>>();
	const seen = new Set<string>();
	const queue = [...tests];
	while (queue.length > 0) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);
		if (!CODE_EXT.test(file)) continue;
		for (const dependency of localImports(file)) {
			let importers = reverse.get(dependency);
			if (!importers) {
				importers = new Set();
				reverse.set(dependency, importers);
			}
			importers.add(file);
			if (!seen.has(dependency)) queue.push(dependency);
		}
	}
	for (const file of seen) if (!reverse.has(file)) reverse.set(file, new Set());
	return reverse;
}

function testsReaching(seeds: Iterable<string>, reverse: Map<string, Set<string>>, isTest: Set<string>): Set<string> {
	const hit = new Set<string>();
	const seen = new Set<string>();
	const queue = [...seeds];
	while (queue.length > 0) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);
		if (isTest.has(file)) hit.add(file);
		for (const importer of reverse.get(file) ?? []) queue.push(importer);
	}
	return hit;
}

function nativesEntry(): string | undefined {
	try {
		return toPosix(
			fs.realpathSync(Bun.resolveSync("@oh-my-pi/pi-natives", path.join(repoRoot, "packages", "coding-agent"))),
		);
	} catch {
		return undefined;
	}
}

async function selectTests(packages: TestPackage[]): Promise<Set<string>> {
	const allTests = packages.flatMap(pkg => pkg.tests);
	if (runAll) return new Set(allTests);
	const isTest = new Set(allTests);
	const changed = await changedFiles();
	const reverse = buildReverseGraph(allTests);
	const selected = new Set<string>();
	const seeds: string[] = [];
	const natives = nativesEntry();
	for (const file of changed) {
		const rel = toPosix(path.relative(repoRoot, file));
		if (reverse.has(file)) {
			seeds.push(file);
			continue;
		}
		if (rel.startsWith("crates/") || rel.startsWith("packages/natives/native/") || rel === "Cargo.toml") {
			if (natives) seeds.push(natives);
			continue;
		}
		const base = path.basename(file);
		if (/^(package\.json|bunfig\.toml|tsconfig.*\.json)$/.test(base)) {
			const owner = packages.find(pkg => file.startsWith(`${pkg.dir}/`));
			if (owner) for (const test of owner.tests) selected.add(test);
			continue;
		}
		if (!fs.existsSync(file)) continue;
		for (const test of allTests) {
			if (fs.readFileSync(test, "utf8").includes(base)) selected.add(test);
		}
	}
	for (const test of testsReaching(seeds, reverse, isTest)) selected.add(test);
	return selected;
}

async function runPackage(pkg: TestPackage, files: string[]): Promise<boolean> {
	const cacheDir = path.join(repoRoot, "node_modules", ".cache", "affected-tests");
	fs.mkdirSync(cacheDir, { recursive: true });
	const timings = path.join(cacheDir, `${path.basename(pkg.dir)}.json`);
	const timingArgs = [`--timings=${timings}`, "--update-timings"];
	const env: Record<string, string | undefined> = { ...process.env };
	// %TEMP% on Windows sits under real-time scanning; the same SQLite/file churn
	// runs several times faster inside the repo's ignored cache directory.
	const tmpDir = path.join(cacheDir, "tmp");
	if (process.platform === "win32") {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		fs.mkdirSync(tmpDir, { recursive: true });
		env.TMP = env.TEMP = env.TMPDIR = tmpDir;
	}
	let ok = true;
	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		const batch = files.slice(i, i + BATCH_SIZE).map(file => `./${toPosix(path.relative(pkg.dir, file))}`);
		const argv = [
			process.execPath,
			"test",
			`--parallel=${Math.min(parallel, batch.length)}`,
			"--only-failures",
			...timingArgs,
			...passthrough,
			...batch,
		];
		const proc = Bun.spawn(argv, { cwd: pkg.dir, env, stdout: "inherit", stderr: "inherit" });
		if ((await proc.exited) !== 0) ok = false;
	}
	if (process.platform === "win32") fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3 });
	return ok;
}

const packages = await discoverTestPackages();
const started = performance.now();
const selected = await selectTests(packages);
const plan = packages
	.map(pkg => ({ pkg, files: pkg.tests.filter(test => selected.has(test)) }))
	.filter(entry => entry.files.length > 0);
const total = plan.reduce((sum, entry) => sum + entry.files.length, 0);
const allCount = packages.reduce((sum, pkg) => sum + pkg.tests.length, 0);
console.log(
	`affected-tests: ${total}/${allCount} test files selected in ${((performance.now() - started) / 1000).toFixed(1)}s` +
		plan.map(entry => `\n  ${path.basename(entry.pkg.dir)}: ${entry.files.length}`).join(""),
);
if (listOnly) {
	for (const entry of plan) for (const file of entry.files) console.log(toPosix(path.relative(repoRoot, file)));
	process.exit(0);
}
let failed = false;
for (const entry of plan) {
	console.log(`\n==> ${path.basename(entry.pkg.dir)} (${entry.files.length} files)`);
	if (!(await runPackage(entry.pkg, entry.files))) failed = true;
}
console.log(
	`\naffected-tests: done in ${((performance.now() - started) / 1000).toFixed(1)}s${failed ? " with failures" : ""}`,
);
process.exit(failed ? 1 : 0);
