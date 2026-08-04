status: complete
scope_status: bounded
change: installer-mandatory-checksum
phase: sdd-map

ledger:
  reads:
    - { path: "openspec/changes/installer-mandatory-checksum/scope.md", lines: 96, estimated_tokens: 1600 }
    - { path: "openspec/specs/installer-runtime/spec.md", lines: 15, estimated_tokens: 250 }
    - { path: "openspec/changes/installer-mandatory-checksum/specs/installer-runtime/spec.md", lines: 12, estimated_tokens: 200 }
    - { path: "EIN.md", lines: 38, estimated_tokens: 300 }
    - { path: "installer/install.sh", lines: 140, estimated_tokens: 1200 }
    - { path: "tests/install-sh-wsl.test.ts", lines: 27, estimated_tokens: 250 }
    - { path: "tests/release-asset-contract.test.ts", lines: 220, estimated_tokens: 2100 }
    - { path: ".github/workflows/installer-release.yml", lines: 97, estimated_tokens: 850 }
    - { path: "installer/src/core/checksum.ts", lines: 40, estimated_tokens: 450 }
    - { path: "installer/src/core/acquisition.ts", lines: 90, estimated_tokens: 950 }
    - { path: "installer/package.json", lines: 21, estimated_tokens: 250 }
    - { path: "bunfig.toml", lines: 5, estimated_tokens: 100 }
    - { path: "openspec/config.yaml", lines: 50, estimated_tokens: 500 }
    - { path: "tests/preload-env.ts", lines: 16, estimated_tokens: 180 }
    - { path: "tests/updater-cli-entrypoints.test.ts", lines: 73, estimated_tokens: 700 }
    - { path: "tests/release-update-integration.test.ts (lines 1-120)", lines: 120, estimated_tokens: 900 }
    - { path: "installer/README.md", lines: 81, estimated_tokens: 850 }
    - { path: "README.md (lines 1-155)", lines: 155, estimated_tokens: 1500 }
    - { path: "grep install.sh/checksum/bypass references", lines: 100, estimated_tokens: 700 }
    - { path: "codegraph callers runUpdate; checksum symbols not indexed", lines: 1, estimated_tokens: 120 }
  webfetch_used: false
  webfetch_urls: []
  budget_source: allocated
  budget_consumed: { tokens: 13800, reads: 20 }

## OpenSpec contract

- The canonical `installer-runtime` spec has the existing runtime-installation scenarios; the change delta adds `installer-bootstrap-mandatory-checksum`.
- The delta requires the selected bootstrap asset to be installed only after `checksums.txt` is downloaded and exactly one valid selected entry matches. Unavailable, malformed, missing, and mismatched metadata must exit nonzero before publication or execution.
- The scope packet is the controlling boundary: checksum gate only, focused deterministic coverage, no checksum bypass, and no coupling to the compiled updater parser.

## Current bootstrap flow (`installer/install.sh`)

1. `set -euo pipefail` is enabled. `REPO` comes from `EIN_INSTALLER_REPO` (repository selection only); `BINARY_NAME` is `ein` (lines 10-13).
2. `detect_platform` (lines 40-64) calls `uname`, maps Darwin/Linux and arm64/aarch64/x86_64/amd64, derives `ASSET=ein-installer-${OS}-${ARCH}`, and detects WSL only for informational output. WSL remains the Linux asset path.
3. `main` (lines 84-97) prints the banner, detects the platform, requires only `curl`, builds the unchanged `releases/latest/download` base plus asset and `checksums.txt` URLs, creates `mktemp -d`, and registers an EXIT trap removing the temporary directory.
4. The binary download (lines 99-102) is fail-closed already: `curl -fsSL -o "$tmp/ein"` failure calls `fatal` before install-directory selection or publication.
5. The checksum block (lines 104-118) is currently optional:
   - A failed checksum request is the condition of an `if`, so it is ignored despite `set -e`; execution continues.
   - A successful response is searched with `grep " ${ASSET}$` and `awk '{print $1}'`. This is a suffix/partial extraction, not validation of every nonempty manifest line, exact GNU shape, or entry cardinality.
   - An empty/missing selected entry is silently accepted because hashing is nested under `[ -n "$expected" ]`.
   - Duplicate selected lines are not explicitly rejected; their multiple extracted digests become one newline-containing value and usually fail comparison, but this is accidental and not a strict duplicate decision.
   - Malformed unrelated lines are ignored. A malformed selected line is not parsed as a manifest error; it only tends to become a later digest mismatch.
   - `sha256sum` is preferred by command presence; otherwise `shasum -a 256` is invoked without checking that it exists or produced a usable digest. Neither utility is required by `need`.
   - Only a nonempty expected value reaches the actual digest comparison. A mismatch calls `fatal`; a match prints the success message.
6. Only after the optional checksum block, `pick_install_dir` (lines 68-76 and call at 120) chooses writable `/usr/local/bin` or creates `${HOME}/.local/bin`. Then `chmod 755` and `mv` publish the binary (lines 121-122), PATH guidance is printed, and the existing TTY/non-TTY handoff runs (lines 128-138). The Linux `/dev/tty` branch must remain unchanged.
7. The EXIT trap cleans the temporary directory on both successful and failed paths. The requested security ordering is therefore available without moving installation behavior: checksum retrieval, parsing, and hashing must complete before `pick_install_dir`, `chmod`, `mv`, or either `exec` branch.

## Release and parser contracts

- `.github/workflows/installer-release.yml:69-73` creates `dist/checksums.txt` with `sha256sum ein-installer-* > checksums.txt`; the published shape is 64 lowercase hexadecimal characters, two spaces, and the asset name. The workflow publishes four platform binaries, `dist/checksums.txt`, and `install.sh` (lines 75-97). No workflow change is mapped.
- `tests/release-asset-contract.test.ts` is an offline text/contract suite. It pins the four asset names and workflow publication set, checks the GNU line shape, rejects BSD `*asset` markers, and already exercises the TypeScript parser's malformed/missing/duplicate behavior. It does not execute `install.sh`.
- `installer/src/core/checksum.ts` and `installer/src/core/acquisition.ts` are the compiled updater's separate typed path: `acquireRelease` downloads staged bytes, calls `parseChecksums`, then `verifyAsset` before returning an acquired release. This change must not import, modify, or generalize that path. The bootstrap will have its own shell validation.

## Callers and references

- `install.sh` is not imported by TypeScript and has no in-repository function callers; its executable entry is `main "$@"` at the end of the file.
- User/public references are the root README quick-start and source-of-truth link, `installer/README.md` installation instructions, and the copied Pi operating-system documentation found by reference search. They all describe the bootstrap as the public release installer; they do not provide a checksum bypass.
- The release workflow's notes point users at the raw `main/installer/install.sh`, and the workflow publishes this script as a release asset. The checksum manifest is generated and published by the same workflow.
- The only current focused bootstrap test is `tests/install-sh-wsl.test.ts`: it reads the script text and preserves the `/proc/version`/`WSL_DISTRO_NAME` detection and Linux `/dev/tty` assertions. It must remain intact. The release contract test is adjacent coverage for asset/manifest conventions, not a bootstrap caller.

## Focused regression harness map

The repository uses Bun's built-in `bun:test`; `installer/package.json` has no test script, and the root preload only sandboxes EIN Pi paths. Existing subprocess/temp-fixture conventions are visible in `tests/updater-cli-entrypoints.test.ts` (`Bun.spawnSync`, merged environment, captured stdout/stderr) and `tests/release-update-integration.test.ts` (temporary roots, cleanup, deterministic byte fixtures). Do not run those tests in map.

A new focused shell-behavior test (or an equally small extension of the focused shell test) can exercise the real `installer/install.sh` without network or installation mutation:

- Create a temporary fixture root and a fake `PATH` prefix containing executable `curl`, `uname`, `chmod`, and `mv` scripts. Leave normal shell utilities available after the prefix.
- Make fake `curl` accept the script's `-o path URL` shape, write a deterministic binary fixture or manifest fixture, and return a nonzero status only for the unavailable-checksum case. It must reject/record unexpected URLs so no GitHub request can occur.
- Make fake `uname` select a deterministic Darwin x64 case for this harness. With piped/non-TTY stdin, the existing success branch prints the handoff message rather than executing a target binary; the separate WSL static test continues to cover the Linux `/dev/tty` contract.
- Make fake `chmod` and `mv` append ordered events to a fixture log and never touch their requested destination. This avoids dependence on whether the host's `/usr/local/bin` happens to be writable and proves that failed verification never reaches publication. Set `HOME` and `TMPDIR` to temporary paths as well, and assert the temporary download directory observed by fake `curl` disappears via the EXIT trap.
- Use real `sha256sum` where available for the normal success/mismatch cases, and controlled utility variants for the `shasum -a 256` fallback and no-usable-utility failure. The harness must distinguish command absence/failure from a successful digest and must never treat a missing utility as an optional check.

Required independent cases and assertions:

1. checksum download failure: nonzero exit, no `chmod`/`mv` event, no destination publication;
2. empty/missing selected asset: nonzero exit and no publication;
3. malformed nonempty manifest (including invalid digest/spacing or BSD marker): nonzero exit and no publication;
4. duplicate selected entries: nonzero exit and no publication;
5. digest mismatch: nonzero exit and no publication;
6. successful exact GNU entry: zero exit, `verify/hash` event before `chmod` and `mv`, existing install output and non-TTY handoff retained, with all writes confined to the fixture root;
7. missing/unusable checksum utility: nonzero exit and no publication (plus the portable `shasum` success path where the fixture can make `sha256sum` unavailable).

The test should use the release-contract asset name and digest format but must not call `parseChecksums`; otherwise it would test the wrong implementation. Preserve `tests/install-sh-wsl.test.ts` and keep the release contract test as the source of publication-format truth.

## Constraints and design cautions

- Strictly validate every nonempty checksum line against the workflow's GNU form, allow the terminal newline produced by `sha256sum`, require the selected asset exactly once, and reject an empty manifest or any malformed selected/unrelated nonempty entry. The exact blank-line policy should be made explicit in design; a terminal split artifact must not make the normal newline invalid.
- Do not use a partial `grep` match as proof. The selected filename is currently generated from controlled OS/arch values, but manifest parsing still needs exact field boundaries and cardinality.
- Validate command availability and command result before comparison. An absent or unusable `sha256sum`/`shasum` path must fail closed before install; do not let `set -e` accidents define the security behavior.
- Keep `pick_install_dir`, permissions, PATH notice, temporary cleanup, platform/WSL logic, and TTY/TUI handoff outside the checksum decision. In particular, checksum failure must occur before the fallback `mkdir -p ${HOME}/.local/bin` in `pick_install_dir`.
- `EIN_INSTALLER_REPO` remains a URL/repository override only. No `SKIP_CHECKSUM`, development mode, command-line opt-out, or environment verification escape exists or is warranted.
- The two `latest/download` requests remain independently resolved; a release changing between the asset and manifest requests is a fail-closed mismatch, not a reason to redesign URL pinning here.
- Keep the production diff to the checksum section of `installer/install.sh` and the focused Bun regression coverage. Do not change the workflow, release publication, compiled updater, package metadata, README/CHANGELOG, or unrelated installer audit behavior.

## Blast radius and handoff

- **Production:** one shell file, limited to replacing the optional checksum block with mandatory strict retrieval/parse/hash logic. The intentional behavior change is that releases without usable checksum metadata can no longer install.
- **Tests:** one small behavioral shell harness plus preservation of the existing WSL assertions; the release asset contract remains a read-only format oracle. No generated assets or network fixtures are needed.
- **Unaffected:** compiled updater checksum semantics, `ein update` acquisition/transaction behavior, release workflow asset generation, platform/WSL selection, install-directory choice, permissions, cleanup, PATH messaging, and post-install TTY/TUI handling.
- **Out of scope:** the banner/version fix on the other branch, plus symlink/tar/archive hardening, release redesign, documentation/version changes, and CI/E2E restructuring.

Recommend `sdd-design` next. The design should resolve the shell parser shape and utility fallback details while preserving the fake-command harness and pre-publication ordering above.
