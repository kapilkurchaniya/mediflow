# 07 · Git workflow: two lanes, one `main`

## The rules (short version)

1. **`main` is sacred.** Nobody pushes to it directly. It only changes when a Pull Request (PR) is merged.
2. **Each developer has their own lane:**
   - **Lane A:** `lane-a/overxpowered` (and optional `lane-a/<feature>` branches). Owner: **overxpowered** (GitHub `OVERxPOWERED`).
   - **Lane B:** `lane-b/kapil` (and optional `lane-b/<feature>` branches). Owner: **Kapil** (GitHub `kapilkurchaniya`).
3. **You push only to your own lane.** Never to the other person's branches, never to `main`.
4. **Every change reaches `main` through a PR**, from your lane branch into `main`, reviewed by the **other** developer.
5. **CI must be green** before merging: typecheck, tests, build and the branch guard.
6. **Merge with "Create a merge commit"**, not squash or rebase. Long-lived lane branches stay in sync with `main` without force-pushes.

> **Branch name:** the default branch is currently `master`. The agreed plan is to **rename it to `main`** (steps below). Until then, read `main` as `master` in this document. The hook and workflows already handle both names.

## How the rules are enforced (three layers)

| Layer | What | Where | Can it be bypassed? |
|---|---|---|---|
| 1. Local git hook | `pre-push` refuses pushes to `main`/`master` and to the other lane | `.githooks/pre-push`, installed automatically by `npm install` | Yes, with `--no-verify`. That's a deliberate act; don't. |
| 2. CI branch guard | GitHub Action fails if someone pushes to a lane they don't own, if a PR to `main` doesn't come from the author's own lane, or if `main` changes without a merged PR | `.github/workflows/branch-guard.yml` | It flags (red ❌), it can't block, unless layer 3 makes it a required check |
| 3. GitHub branch protection / rulesets | `main` requires a PR, 1 approval and passing checks; force-push and deletion blocked | GitHub → Settings (repo owner only) | No (except by admins) |

**Why three layers:** the repo is **private** and owned by Kapil's personal account. GitHub only offers branch protection and rulesets on private repos with a paid plan (GitHub Pro / Team). On the free plan, layers 1 and 2 still keep you honest. If Kapil upgrades or the repo becomes public, turn on layer 3.

## One-time setup

### Both developers

```bash
git clone https://github.com/kapilkurchaniya/mediflow.git && cd mediflow
npm install                      # also runs "prepare" → git config core.hooksPath .githooks
git config mediflow.lane a       # overxpowered   (Kapil runs:  git config mediflow.lane b)
git switch lane-a/overxpowered   # Kapil runs:     git switch lane-b/kapil
```

Check that the hook is active: `git config core.hooksPath` should print `.githooks`.

### Kapil only (repo owner, needs admin)

1. **Rename `master` → `main`.** GitHub → repo → *Settings → General → Default branch* → ✏️ rename to `main`. GitHub moves open PRs and protection rules automatically.
   Then **both** developers update their local clone:
   ```bash
   git branch -m master main
   git fetch origin
   git branch -u origin/main main
   git remote set-head origin -a
   ```
2. **Merge settings.** *Settings → General → Pull Requests*: ✅ Allow merge commits; ❌ Allow squash merging; ❌ Allow rebase merging; ✅ Automatically delete head branches **OFF** (lane branches are long-lived).
3. **Protect `main`** (if the plan allows). *Settings → Rules → Rulesets → New branch ruleset*:
   - Target: `main`
   - ✅ Restrict deletions · ✅ Block force pushes
   - ✅ Require a pull request before merging → required approvals **1**, ✅ dismiss stale approvals, ✅ require review from Code Owners
   - ✅ Require status checks to pass → add `verify` (CI) and `lane-rules` (Branch guard)
   - Bypass list: empty.
   - Or with the CLI (run by Kapil):
     ```bash
     gh api -X PUT repos/kapilkurchaniya/mediflow/branches/main/protection --input - <<'EOF'
     {"required_status_checks":{"strict":true,"contexts":["verify","lane-rules"]},
      "enforce_admins":false,
      "required_pull_request_reviews":{"required_approving_review_count":1,"require_code_owner_reviews":true},
      "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
     EOF
     ```
4. **Protect the lane branches** (optional, same plan requirement). Ruleset on `lane-a/**` with "Restrict updates" and bypass for `OVERxPOWERED` only; same for `lane-b/**` with `kapilkurchaniya`.

## Daily loop

```bash
# 1. Start of day: bring in what the other lane merged
git switch lane-a/overxpowered
git fetch origin
git merge origin/main            # resolve conflicts if any, then commit

# 2. Work in small commits
git add -p
git commit -m "feat(rbac): requirePermission helper"

# 3. Push to YOUR lane
git push                         # the hook blocks anything else

# 4. When a roadmap item is done → open a PR into main
gh pr create --base main --head lane-a/overxpowered \
  --title "feat(rbac): enforce permissions in server actions (A1.2)" --fill
```

Then:
- The other developer reviews within **24 hours** (agree on this). They comment, request changes, or approve.
- CI runs. Fix anything red by pushing more commits to the same lane branch; the PR updates automatically.
- **The PR author merges** after approval and green CI, using "Create a merge commit".
- After merging, keep working on the same lane branch. Run `git merge origin/main` the next morning, which is a fast and clean merge.

### Feature branches inside your lane (optional)

If you want to work on two things in parallel, branch inside your lane:

```bash
git switch -c lane-a/offline-sync lane-a/overxpowered
git push -u origin lane-a/offline-sync
gh pr create --base main --head lane-a/offline-sync --fill
```

The hook and branch guard allow any `lane-a/*` branch for Lane A.

## Avoiding merge conflicts

The roadmap assigns **file ownership** (see `.github/CODEOWNERS`). You edit your lane's files freely. **Shared hot-spots** need care:

| Shared file | Protocol |
|---|---|
| `src/server/db/schema/index.ts` | One `export *` line per schema file. Add your line at the end. |
| `drizzle/**` migrations | Follow the migration rule in [04-database.md](04-database.md#the-two-developer-rule-for-migrations). One migration per PR, regenerated after merging `main`. |
| `src/lib/permissions.ts` | Add new permission keys at the end of *your module's* block. |
| `src/app/components/nav/*.ts` (after A0.5) | One file per module group. Edit only your module's file. |
| `package.json` / `package-lock.json` | Add dependencies in a **tiny separate PR** and merge it quickly. On a lockfile conflict, take `main`'s version and rerun `npm install`; never hand-edit it. |

**Talk before touching the other lane's files.** If you need a change in their code, the fastest path is usually: open an issue, or message them; they make the change; you merge `main`.

**Contracts first.** When lanes depend on each other (e.g. Lane B's loyalty redemption is called by Lane A's POS), first merge a tiny PR with the **interface** (types and function signatures that throw `not implemented`). Then both build against it in parallel. The roadmap marks these with 🤝.

## If something goes wrong

| Problem | Fix |
|---|---|
| "✋ Your lane is not configured" | `git config mediflow.lane a` (or `b`) |
| Committed on `main` locally by mistake | `git switch lane-a/overxpowered && git merge main`, then `git switch main && git reset --hard origin/main` (only resets **local** main) |
| Merge conflict after `git merge origin/main` | Open the files, keep both sides' intent, run `npm run typecheck && npm test`, `git add`, `git commit` |
| Lockfile conflict | `git checkout origin/main -- package-lock.json && npm install && git add package-lock.json` |
| Migration conflict | See 04-database.md. Delete your unmerged migration, regenerate. |
| Branch guard red on your PR | Read the error: wrong head branch or wrong author. Open the PR from your own lane. |

## Glossary for this page

- **Branch:** a named line of commits. **Lane branch:** a long-lived branch owned by one developer.
- **Pull Request (PR):** a GitHub request to merge one branch into another, with review and CI.
- **Merge commit:** a commit that joins two histories without rewriting either.
- **Fast-forward:** moving a branch pointer forward when no merge is needed.
- **CI (Continuous Integration):** GitHub Actions that run checks on every push and PR.
- **Git hook:** a script git runs automatically at certain moments, here before every push.
- **CODEOWNERS:** a file that tells GitHub who must review changes to which paths.
- **Ruleset / branch protection:** GitHub settings that block unsafe actions on a branch.
