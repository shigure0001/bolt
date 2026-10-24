import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findDriveRootTmpWrites, findTmpOperands } from "@oh-my-pi/pi-coding-agent/exec/windows-tmp-alias";

describe("findTmpOperands", () => {
	it("finds /tmp paths passed as operands or inside quoted code", () => {
		expect(
			findTmpOperands(`python -m kvstore --file /tmp/x.json set a 1; python -c "open('/tmp/y.json','w')"`),
		).toEqual(["/tmp/x.json", "/tmp/y.json"]);
	});

	it("ignores /tmp as the tail of another path or a remote spec", () => {
		expect(findTmpOperands(`cp ./tmp/a $TMPDIR/tmp/b ~/tmp/c && scp host:/tmp/d . && ls a/tmp/e`)).toEqual([]);
	});
});

describe("findDriveRootTmpWrites", () => {
	let root: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "bolt-tmp-alias-"));
		fs.mkdirSync(path.join(root, "tmp"));
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	// Regression: a native program given `/tmp/x.json` silently wrote the drive
	// root's `tmp`, while the shell (and the agent's checks) looked in `$TMPDIR`.
	it("reports a /tmp operand the command wrote under the drive root", async () => {
		const since = Date.now() - 1;
		const stray = path.join(root, "tmp", "x.json");
		fs.writeFileSync(stray, "{}");
		expect(await findDriveRootTmpWrites("python app.py --file /tmp/x.json", [root], since)).toEqual([stray]);
	});

	it("ignores drive-root files the command did not touch", async () => {
		const old = path.join(root, "tmp", "x.json");
		fs.writeFileSync(old, "{}");
		const past = new Date(Date.now() - 60_000);
		fs.utimesSync(old, past, past);
		expect(await findDriveRootTmpWrites("cat /tmp/x.json /tmp/missing", [root], Date.now() - 1_000)).toEqual([]);
	});
});
