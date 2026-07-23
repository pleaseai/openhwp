#!/usr/bin/env -S deno run --allow-read --allow-run
// Materializes the upstream rhwp checkout at third_party/rhwp, pinned to the
// commit recorded in config/rhwp-studio-overrides.json.
//
// third_party/rhwp is NOT committed (it is gitignored). The full edwardkim/rhwp
// repo is ~1.1 GB (samples/, pdf/, mydocs/), so this uses a blob-filtered,
// cone-sparse checkout of only the paths the studio build needs (rhwp-studio +
// assets) — ~80 MB including the partial .git. Re-run after changing the pin.
//
//   deno run -A scripts/setup-rhwp.ts

const ROOT = new URL("../", import.meta.url).pathname;
const DEST = `${ROOT}third_party/rhwp`;

const manifest = JSON.parse(
  await Deno.readTextFile(`${ROOT}config/rhwp-studio-overrides.json`),
);
const { repo, tag, commit, sparsePaths } = manifest.upstream as {
  repo: string;
  tag: string;
  commit: string;
  sparsePaths: string[];
};

async function git(args: string[], cwd = ROOT): Promise<string> {
  const cmd = new Deno.Command("git", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed:\n${new TextDecoder().decode(stderr)}`,
    );
  }
  return new TextDecoder().decode(stdout).trim();
}

async function exists(path: string): Promise<boolean> {
  return await Deno.stat(path).then(() => true).catch(() => false);
}

if (await exists(`${DEST}/.git`)) {
  const head = await git(["rev-parse", "HEAD"], DEST);
  if (head === commit) {
    console.log(`[setup-rhwp] up to date at ${commit} — nothing to do`);
    Deno.exit(0);
  }
  console.log(
    `[setup-rhwp] third_party/rhwp at ${head}, re-pinning to ${commit}`,
  );
  await git(["sparse-checkout", "set", ...sparsePaths], DEST);
  await git(["checkout", "--detach", commit], DEST);
} else {
  console.log(`[setup-rhwp] sparse partial clone ${repo} @ ${tag} (${commit})`);
  await git([
    "clone",
    "--filter=blob:none",
    "--no-checkout",
    "--quiet",
    repo,
    DEST,
  ]);
  await git(["sparse-checkout", "init", "--cone"], DEST);
  await git(["sparse-checkout", "set", ...sparsePaths], DEST);
  await git(["checkout", "--detach", commit], DEST);
}

const head = await git(["rev-parse", "HEAD"], DEST);
if (head !== commit) {
  console.error(`[setup-rhwp] FAILED: HEAD ${head} != pinned ${commit}`);
  Deno.exit(1);
}
console.log(
  `[setup-rhwp] ready: third_party/rhwp @ ${head} (sparse: ${sparsePaths.join(", ")})`,
);
