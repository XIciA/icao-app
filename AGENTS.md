# ICAO App project instructions

## Document authority

- The current user request defines the goal. The repository code, configuration, tests, and
  generated manifests define the implemented facts.
- Use [docs/README.md](docs/README.md) as the document router. Read only the documents relevant
  to the task; do not preload the full strategy, workstream, incident, or design history.
- `docs/archive/` is historical evidence and has no authority over current work.
- `docs/developer-notes/` is optional human reference. Codex does not need to read or follow it
  unless the user asks or the task specifically involves a documented local/manual procedure.
- When current documents conflict with code, verify the code and update the stale document in
  the same task when that is in scope. Do not silently preserve contradictory rules.

## Durable product and engineering boundaries

- Native iOS and Android use React Native, Expo, and TypeScript with Development Builds and
  CNG/Prebuild. Web uses the repository's Expo Web target.
- Do not introduce WebView or a second application stack without an explicit architecture
  decision.
- Preserve the approved visual identity and learning-flow semantics. For UI work, follow
  `docs/design/ui-style-guide.md` and the code-native tokens and shared components it names.
- Audit for an existing source of truth before adding feature-specific data, resource loading,
  playback, persistence, or UI infrastructure. Do not create competing owners for question-bank
  content, audio mappings, recording lifecycle, account state, or runtime configuration.
- Keep secrets, certificates, signing material, and local environment files out of the repository,
  logs, and chat. Do not revert unrelated user changes.
- Use pnpm and repository-locked versions.

## Task workflow and verification

- Use `docs/bigandsmall-workflows/orchestration-loop.md` for ordinary changes. Use the large-flow
  sections of `document-driven-development-workflow.md` only when the change is cross-system,
  high-risk, long-running, or needs durable product/architecture decisions.
- Choose checks by risk and affected surface using `docs/engineering/verification-matrix.md`.
  A successful build alone is not visual acceptance for UI work.
- Read the exact Expo SDK 55 documentation before changing Expo APIs, plugins, permissions, or
  native configuration: <https://docs.expo.dev/versions/v55.0.0/>.
- Update `src/config/app-version.ts` only when the task changes shipped user-visible behavior or
  content, runtime behavior, or release output, or when the user explicitly requests a version
  bump. Documentation-only, test-only, and internal-tooling-only changes do not bump it.

## Conditional rules

- Before audio lifecycle, permission, player, recorder, recording-file, or transcription-trigger
  changes, first read `docs/rules/problem-solving-and-maintenance/recording.md`, then read
  `docs/guides/audio-lifecycle-and-change-rules.md` completely. Reuse the existing Recording
  Engine, orchestrator, recorder adapter, repository, and asset types; do not restore a second
  controller or patch platform timing guesses into UI code.
- For runtime topology and deployment work, follow
  `docs/operations/deployment-and-runtime-rules.md`. Local API changes are not automatically
  authorized for production deployment; deploy only when the task includes the live environment.
- Database migrations require explicit review, backup, execution, and post-migration verification.
