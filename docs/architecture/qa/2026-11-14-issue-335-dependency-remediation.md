# Dependency remediation for the local gate

Issue #335 records two blocking OSV findings discovered while implementing #329; this document records the bounded correction and its verification scope.

## Findings and decision

OSV 2.7.1 initially exits 1: esbuild 0.18.20 through drizzle-kit's deprecated esbuild-kit
loader (GHSA-67mh-4wv8-2f99), and minimatch 10.2.6 through typescript-eslint
(GHSA-g3hv-75wg-m249). Both are medium; no reachable production exploit is asserted.
Registry inspection on 2026-11-14 finds drizzle-kit latest 0.31.11 still carries that loader,
and typescript-estree latest 8.72.2 still requests minimatch ^10.2.2. The latest 10.x is
10.2.6. A normal compatible upstream update therefore does not remove either path.

Options: A narrowly override only the affected parent/child edges; B update direct parents
without overrides; C exclude the advisories. Scores are engineering estimates, 0–5.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Remove known findings, mandatory | 40 | 5: fixed versions selected | 0: latest parents still affected | 0: findings remain |
| Scope of dependency changes | 20 | 4: two parent-qualified edges | 3: direct tooling family updates | 5: no package change |
| Compatibility confidence before checks | 20 | 3: cross-version override needs validation | 5: upstream ranges retained | 5: unchanged runtime |
| Maintenance | 10 | 3: remove overrides when upstream fixes | 4: normal update process | 1: exception expiry burden |
| Local reproducibility | 10 | 5: frozen lock and OSV prove resolution | 5: frozen lock | 3: depends on scan exception |
| Total /500 | **100** | **420** | **260, eliminated** | **330, eliminated** |

Weighted points: A=200+80+60+30+50, B=0+60+100+40+50, C=0+100+100+10+30.
Double compatibility weight to 40 and scale others by 0.75: A=390, B=320, C=372.5.
Halve it to 10 and scale others by 1.125: A=435, B=230, C=308.75.
B/C remain eliminated on the mandatory criterion. A is the recommendation; B becomes the
fallback once upstream dependency ranges actually remove both findings.

Use esbuild 0.25.12 only under @esbuild-kit/core-utils, and minimatch 11.0.4 only under
@typescript-eslint/typescript-estree. esbuild 0.25.12 and minimatch 11.0.4 already occur
elsewhere in the workspace; minimatch's Node 20 or >=22 requirement admits pinned Node 22.
No blanket override of unrelated dependency trees and no vulnerability exclusion is planned.

## Required verification

Frozen installation and OSV must pass without exclusions. Verify drizzle-kit can load a
temporary TypeScript schema/config and generate SQLite migration output only in a disposable
directory; do not connect to or migrate real application data. Run the real ESLint/types,
application regression/coverage and production build, and inspect the resulting lockfile.
Executed before final signed publication: frozen installation passes; OSV 2.7.1 reports no
issues without exclusions; a disposable TypeScript SQLite schema/config generates one SQL
migration successfully through real drizzle-kit. Types/lint, the full 1,446-test application
suite, production build and two API-stubbed Chromium smokes pass. No real database was opened
or migrated. The lockfile diff removes the affected esbuild platform packages and minimatch
10.2.6, reusing the existing fixed versions. Final exact-head signed evidence belongs to the
#329 implementation PR, not this preliminary working-tree result. Deprecated esbuild-kit
upstream dependencies still exist; these overrides remedy advisories, not upstream support.
