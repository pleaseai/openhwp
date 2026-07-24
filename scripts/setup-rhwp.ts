#!/usr/bin/env -S deno run --allow-read --allow-run
// Materializes the upstream rhwp checkout at third_party/rhwp, pinned to the
// commit recorded in config/rhwp-studio-overrides.json.
//
// third_party/rhwp is NOT committed (it is gitignored). The full edwardkim/rhwp
// repo is ~1.1 GB (samples/, pdf/, mydocs/), so this uses a blob-filtered,
// cone-sparse checkout of only the paths the studio build needs (rhwp-studio +
// assets) — ~80 MB including the partial .git. Re-run after changing the pin.
//
// It is a disposable materialized checkout: build-studio.ts mutates it in place
// (copies pkg/, drops public/samples, npm rewrites the lock), so setup force-
// checks-out the pin on every run to discard that drift and reconcile the sparse
// paths — a plain checkout would refuse to re-pin over the dirty worktree.
//
//   deno run --allow-read --allow-run scripts/setup-rhwp.ts

const ROOT = `${import.meta.dirname}/../`;
const DEST = `${ROOT}third_party/rhwp`;

interface Upstream {
  repo: string;
  tag: string;
  commit: string;
  sparsePaths: string[];
}

// The manifest is committed and PR-reviewed, but a hand-edit that drops a field
// or leaves an empty commit would otherwise flow `undefined`/`""` straight into
// git args (checking out the wrong thing, or an empty sparse set). Validate up
// front so a bad manifest fails with a clear message instead of a git error.
function parseManifest(raw: string): Upstream {
  const manifest = JSON.parse(raw) as { upstream?: Partial<Upstream> };
  const u = manifest.upstream ?? {};
  const str = (k: "repo" | "tag" | "commit"): string => {
    const v = u[k];
    if (typeof v !== "string" || v.length === 0) {
      throw new Error(`manifest upstream.${k} must be a non-empty string`);
    }
    return v;
  };
  const repo = str("repo");
  const tag = str("tag");
  const commit = str("commit");
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(
      `manifest upstream.commit must be a full 40-char SHA, got "${commit}"`,
    );
  }
  const { sparsePaths } = u;
  if (
    !Array.isArray(sparsePaths) || sparsePaths.length === 0 ||
    !sparsePaths.every((p) => typeof p === "string" && p.length > 0)
  ) {
    throw new Error("manifest upstream.sparsePaths must be a non-empty string[]");
  }
  return { repo, tag, commit, sparsePaths };
}

const { repo, tag, commit, sparsePaths } = parseManifest(
  await Deno.readTextFile(`${ROOT}config/rhwp-studio-overrides.json`),
);

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
  // Fetch the pinned commit, then force it (discarding any in-place build
  // mutations — --force only touches tracked files, so node_modules/pkg
  // survive) and reconcile the sparse paths. The partial clone only has history
  // up to clone time, so a manifest bump to a newer upstream commit isn't local
  // yet — fetch it first (blobless; GitHub serves a tag-reachable SHA directly).
  // Idempotent: an already-present commit fetches as a fast no-op.
  console.log(`[setup-rhwp] ensuring third_party/rhwp @ ${commit}`);
  await git(["fetch", "--filter=blob:none", "origin", commit], DEST);
  await git(["checkout", "--force", "--detach", commit], DEST);
  await git(["sparse-checkout", "set", ...sparsePaths], DEST);
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
