# ICAO App project instructions

## Required references

Before changing implementation, read the current stage documents and the relevant
sections of the read-only design repository:

- `/Users/zhouyide/Desktop/icao设计稿/战略/总战略文档.md`
- `/Users/zhouyide/Desktop/icao设计稿/战略/architecture-decisions.md`
- `/Users/zhouyide/Desktop/icao设计稿/战略/阶段执行管理总则.md`
- `/Users/zhouyide/Desktop/icao设计稿/战略/第一阶段-ReactNativeApp复刻与基础能力/`
- `/Users/zhouyide/Desktop/icao设计稿/docs/ui-style-guide.md`
- `/Users/zhouyide/Desktop/icao设计稿/docs/bigandsmall-workflows/orchestration-loop.md`

The design repository is read-only. All React Native code, configuration, tests,
phase logs, and closeout records belong in this repository.

## Product and technical boundaries

- Build native iOS and Android with React Native, Expo, and TypeScript.
- Use Development Builds and CNG/Prebuild. Expo Go is not the capability boundary.
- Never use WebView or migrate Web UI, CSS, DOM, or browser APIs.
- Treat the Web project as a visual, content, interaction, state, and business-rule reference.
- Preserve the approved brand colors, typography roles, navigation model, component tone,
  and core learning flow.
- Do not add real Supabase auth, cloud sync, complete AI, payments, memberships, downloads,
  or offline learning during phase 1.
- Keep future account, sync, AI, and commercialization integrations replaceable.
- Do not bundle the full audio library without an explicit resource plan.

## Engineering workflow

- Read the exact Expo SDK documentation at https://docs.expo.dev/versions/v55.0.0/
  before using or changing Expo APIs.
- Use pnpm and the versions locked by this repository.
- Work in the current roadmap stage only, in the smallest independently verifiable loop.
- Do not revert unrelated changes. Do not commit secrets, certificates, local environment
  files, or signing material.
- After TypeScript or React Native changes, run `pnpm check` and the relevant native build.
- Review Git diff and generated files before each stage checkpoint.
- UI work requires rendered checks against the design baseline; a successful build alone
  is not visual acceptance.

## Runtime deployment and acceptance

- Treat the repository as the single source of truth, but distinguish local code from the
  version currently running on ECS.
- Changes under `services/api` are not complete for simulator, physical-device, or integrated
  testing until the intended clean version is deployed to ECS, the API container is restarted,
  `/health/ready` passes, and the changed live endpoint is verified with a representative request.
- ECS deployment is the default final step after an authorized `services/api` change unless the
  user explicitly limits the task to local work. Never deploy unrelated dirty-worktree changes;
  build from the intended commit or an explicitly reviewed file set and preserve a rollback image
  and source backup.
- React Native JavaScript and TypeScript UI changes normally use Metro and do not require ECS
  deployment. Native dependency, Expo plugin, permission, or native configuration changes require
  a rebuilt Development Build.
- Database schema or migration changes are not covered by ordinary API deployment. They require
  a database backup, explicit migration review, execution, and post-migration verification.
- Never copy secrets into the repository, deployment archive, logs, or chat. Keep runtime secrets
  in the existing protected ECS environment files.
- Follow `docs/deployment-and-runtime-rules.md` for the runtime map, deployment evidence, and
  rollback requirements.
