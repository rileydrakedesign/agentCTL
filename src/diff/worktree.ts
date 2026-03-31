import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const exec = promisify(execFile);

/** Check whether a string is a valid git ref (branch, tag, or commit). */
export async function isGitRef(ref: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--verify", ref], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Create a temporary git worktree checked out at the given ref. */
export async function createWorktree(ref: string): Promise<string> {
  const id = randomBytes(4).toString("hex");
  const worktreePath = join(tmpdir(), `agentctl-diff-${id}`);
  await exec("git", ["worktree", "add", "--detach", worktreePath, ref], {
    timeout: 30_000,
  });
  return worktreePath;
}

/** Remove a git worktree and clean up. */
export async function removeWorktree(worktreePath: string): Promise<void> {
  try {
    await exec("git", ["worktree", "remove", "--force", worktreePath], {
      timeout: 10_000,
    });
  } catch {
    // Best-effort cleanup — worktree may already be gone
  }
}
