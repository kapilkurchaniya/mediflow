# Contributing to MediFlow

MediFlow is built by two developers working in parallel **lanes**. Full details are in [`docs/07-git-workflow.md`](docs/07-git-workflow.md).

| Lane | Developer | GitHub | Branch(es) | Owns |
|---|---|---|---|---|
| **A** | overxpowered | `OVERxPOWERED` | `lane-a/overxpowered`, `lane-a/*` | Platform, POS/sales, inventory & transfers, accounting core, offline POS, ops |
| **B** | Kapil | `kapilkurchaniya` | `lane-b/kapil`, `lane-b/*` | Purchasing, compliance, GST/e-invoice, CRM & loyalty, WhatsApp/SMS, reports, AI, data import |

## The rules

1. **Never push to `main`** (currently still named `master`). It changes only through merged Pull Requests.
2. **Push only to your own lane's branches.**
3. **Every PR into `main` comes from your lane branch, is reviewed by the other developer, and has green CI.**
4. **Merge with "Create a merge commit"** (no squash or rebase), so lane branches stay in sync.
5. **Merge `origin/main` into your lane at least daily**, and always right before opening a PR.

These are enforced by a local `pre-push` hook (`.githooks/pre-push`, installed by `npm install`), by a CI branch guard (`.github/workflows/branch-guard.yml`), and, where the GitHub plan allows, by branch protection on `main`.

## Manual test guides (keep them current)

[`A_TEST_GUIDE.md`](A_TEST_GUIDE.md) (Lane A) and [`B_TEST_GUIDE.md`](B_TEST_GUIDE.md) (Lane B) describe how to test every phase from the **user** and the **developer** point of view, with the expected result for each step. **A PR that changes behaviour updates the matching guide in the same PR** (new tests, changed steps, ⏳ → ✅). Reviewers check the box in the PR template. `npm run db:reset` creates one login per role so the guides can be followed as written.

## First-time setup

```bash
npm install
git config mediflow.lane a     # overxpowered  — Kapil uses: b
git switch lane-a/overxpowered # Kapil uses: lane-b/kapil
```

## Before opening a PR

```bash
git fetch origin && git merge origin/main
npm run typecheck && npm test && npm run build
gh pr create --base main --fill
```

Read [`docs/06-coding-standards.md`](docs/06-coding-standards.md) and fill in the PR template checklist. The plan of work is [`ROADMAP.md`](ROADMAP.md).
