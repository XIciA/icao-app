# Web/Vercel freeze guard

The native commercial-launch workstream must not change or deploy the existing Expo Web/Vercel
surface. Run this read-only guard before and after each native implementation phase:

```sh
node tools/check-web-freeze.mjs
```

The checked baseline is `web-freeze-manifest.json`. It contains SHA-256 hashes of the current
Vercel configuration and functions, public assets, Web build/deploy tooling, every explicit
`.web.*` implementation, and the repository-local files in Metro's resolved production Web
dependency graph. This graph-based selection intentionally leaves a native/default file outside
the freeze when Metro resolves a separate `.web.*` counterpart instead. The checker's pinned
manifest digest also makes an unreviewed baseline replacement fail.

The baseline captures the exact workspace state, including pre-existing uncommitted changes. A
failure is a stop condition: review and remove or isolate the Web-affecting change. Do not replace
the baseline merely to make the check pass.

## 2026-08-12 reviewed baseline refresh

The dual-auth/Aliyun work changed two protected workspace-level inputs: `pnpm-lock.yaml` gained
API-only Aliyun/Standard Webhooks dependencies while preserving the repository's existing audio
upgrade, and `pnpm-workspace.yaml` explicitly disabled an unnecessary legacy postinstall from an
Aliyun transitive package. A final reviewed refresh also pinned the vulnerable transitive
`ini@1.3.5` to compatible patched `ini@1.3.8`; this changed only those same two workspace metadata
files. The guard proved that all other 324 protected files, including the
resolved Web source graph and `src/config/app-version.ts`, still matched the approved baseline.

The Native display-version increment was isolated into `.ios.ts` and `.android.ts` files; the Web
continues to resolve the unchanged base version file. After this path-by-path review, only the two
workspace metadata hashes and the combined digest were refreshed. No Expo Web export, preview,
Vercel action, or user-visible Web source change was performed.

This is a local source/export-input guard. It does not verify the identity or contents of the live
Vercel deployment, Vercel environment variables, deployment hooks, or dashboard auto-deploy
settings. Those remain separate operational checks, and this workstream must not run any Vercel
deployment or content-sync command.
