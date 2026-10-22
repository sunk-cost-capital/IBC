// Smoke test for a built IBC bundle on the current OS.
//
// Unpacks the bundle into a folder whose path contains a space, the way the
// Sunk Cost desktop app installs it ("Sunk Cost"), builds a fake IB Gateway
// install whose only class is the ibgateway.GWClient stub, and runs IBC's start
// script with the same command line the desktop app uses. Passes when IBC
// reports this bundle's version and hands over to the fake Gateway.
//
// Usage: node sunk/smoke/smoke.mjs <bundle.tar.gz>
// Needs JAVA_HOME pointing at a JDK 17 or newer.

import { spawn, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GATEWAY_VERSION = "1037";
const TIMEOUT_MS = 120_000;
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";

const archive = path.resolve(process.argv[2] ?? "");
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const version = readFileSync(path.join(root, "sunk", "VERSION"), "utf8").trim();
const javaHome = process.env.JAVA_HOME;
const tool = (name) =>
	path.join(javaHome ?? "", "bin", isWindows ? `${name}.exe` : name);

function run(command, args) {
	const result = spawnSync(command, args, { stdio: "inherit" });
	if (result.status !== 0)
		throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

mkdirSync(path.join(root, "target"), { recursive: true });
const work = mkdtempSync(path.join(root, "target", "smoke-"));
const appResources = path.join(work, "Sunk Cost", "resources");
mkdirSync(appResources, { recursive: true });
// Windows' own bsdtar: Git Bash's GNU tar reads "C:\\..." as a remote host.
const tar = isWindows
	? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
	: "tar";
run(tar, ["-xzf", archive, "-C", appResources]);
const ibcPath = path.join(appResources, `IBC-${version}`);

// Fake Gateway: <tws>/ibgateway/<version> on Windows and Linux,
// <tws>/IB Gateway <version> on macOS, as IBC's scripts expect.
const twsPath = path.join(work, "Jts");
const gatewayPath = isMac
	? path.join(twsPath, `IB Gateway ${GATEWAY_VERSION}`)
	: path.join(twsPath, "ibgateway", GATEWAY_VERSION);
const jars = path.join(gatewayPath, "jars");
const install4j = path.join(gatewayPath, ".install4j");
mkdirSync(jars, { recursive: true });
mkdirSync(install4j, { recursive: true });
const stubClasses = path.join(work, "stub-classes");
run(tool("javac"), [
	"--release",
	"17",
	"-d",
	stubClasses,
	path.join(root, "sunk", "tws-stubs", "ibgateway", "GWClient.java"),
]);
run(tool("jar"), ["--create", "--file", path.join(jars, "gateway.jar"), "-C", stubClasses, "."]);
writeFileSync(path.join(gatewayPath, "ibgateway.vmoptions"), "-Xmx256m\n");
// IBC finds the Gateway's own Java through install4j's files: inst_jre.cfg on
// Windows and Linux, the jre.bundle beside it on macOS.
if (!javaHome) throw new Error("Set JAVA_HOME to a JDK 17 or newer");
if (isMac) {
	mkdirSync(path.join(install4j, "jre.bundle", "Contents"), { recursive: true });
	symlinkSync(javaHome, path.join(install4j, "jre.bundle", "Contents", "Home"));
} else {
	writeFileSync(path.join(install4j, "inst_jre.cfg"), `${javaHome}\n`);
}
// Headless keeps CI runners display-free.
writeFileSync(
	path.join(install4j, "i4jparams.conf"),
	'<config><variable name="javaOptions" value="-Djava.awt.headless=true" /></config>\n',
);

const configPath = path.join(work, "Sunk Cost", "ibc-config.smoke.ini");
writeFileSync(configPath, "IbLoginId=\nIbPassword=\nTradingMode=paper\nLoginDialogDisplayTimeout=20\n");

// The desktop app's command line (apps/electron-desktop/src/ibc-config.ts).
const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "/bin/bash";
const args = isWindows
	? [
			"/d",
			"/c",
			"call",
			path.join(ibcPath, "scripts", "StartIBC.bat"),
			GATEWAY_VERSION,
			"/G",
			`/TwsPath:${twsPath}`,
			`/IbcPath:${ibcPath}`,
			`/Config:${configPath}`,
			"/Mode:paper",
			"/On2FATimeout:exit",
		]
	: [
			path.join(ibcPath, "scripts", "ibcstart.sh"),
			GATEWAY_VERSION,
			"--gateway",
			`--tws-path=${twsPath}`,
			`--ibc-path=${ibcPath}`,
			`--ibc-ini=${configPath}`,
			"--mode=paper",
			"--on2fatimeout=exit",
		];

console.log(`IBC folder: ${ibcPath}`);
// On macOS IBC keeps Gateway settings in ~/Jts, which a real Gateway install
// creates; HOME points there so the fake one's folder serves.
const child = spawn(command, args, {
	cwd: ibcPath,
	env: { ...process.env, HOME: work },
	stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [child.stdout, child.stderr])
	stream.on("data", (chunk) => {
		output += chunk;
		process.stdout.write(chunk);
	});
const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
const code = await new Promise((resolve) => child.once("exit", resolve));
clearTimeout(timer);

const expectations = [
	[`version: ${version}`, "IBC.jar from the bundle ran"],
	["SUNK_IBC_SMOKE gateway started", "IBC handed over to the Gateway"],
];
const missing = expectations.filter(([text]) => !output.includes(text));
for (const [, meaning] of missing) console.error(`FAIL: ${meaning}`);
if (missing.length > 0) {
	console.error(`start script exited with ${code}`);
	process.exit(1);
}
console.log(`PASS: IBC ${version} from a folder with a space, on ${process.platform}`);
