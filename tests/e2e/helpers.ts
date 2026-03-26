import { execFile } from "node:child_process";
import { resolve } from "node:path";

const CLI_PATH = resolve(__dirname, "../../src/cli/index.ts");

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run the agentctl CLI with the given args. */
export function runCli(
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["tsx", CLI_PATH, ...args],
      {
        cwd: opts?.cwd,
        env: { ...process.env, ...opts?.env, NO_COLOR: "1" },
        timeout: 30_000,
      },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: err?.code !== undefined
            ? (typeof err.code === "number" ? err.code : 1)
            : 0,
        });
      },
    );
  });
}
