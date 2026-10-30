# Royal Club

Royal Club is an Android-first multi-game platform in active development, built with Flutter, a Fastify/TypeScript API, and PostgreSQL.

**Current status:** development and verification are ongoing. The repository's default branch is `main`; merged code and automated CI results do not by themselves establish production readiness.

## Product scope

- Backgammon is the current implementation focus. Chess and card-game entry points remain part of the product.
- Persian and English are the supported languages.
- Account, friends, notifications, private chat, wallet/subscription, league, ranking, and owner-admin foundations are implemented to varying levels of automated coverage.
- Phase 4 agent tooling is intentionally dormant: task definitions and proposals are for owner review only. No agent identity, delegated permission, schedule, or execution runtime is activated automatically.

## Repository layout

- `apps/mobile`: Flutter application.
- `apps/api`: Fastify API and PostgreSQL integration.
- `infra`: local infrastructure configuration.
- `docs`: architecture, security, deployment, phase-readiness, and acceptance documentation.

## Readiness and release gates

See [Phase 1–4 readiness](docs/PHASE-1-3-READINESS.md), [API security review](docs/PHASE-1-SECURITY-REVIEW.md), and [Persian/English localization audit](docs/PHASE-1-LOCALIZATION-AUDIT.md).

The remaining release gates include production configuration and schema verification, owner-approved SMS activation and real-device checks, multi-device online-match acceptance, manual RTL/LTR review, and final end-to-end sign-off. The latest merged API source must be deployed and verified before claiming that production runs the current code.

## Deployment safety

- Production API deployment is manual-only. A merge or push must not deploy production automatically.
- Keep real SMS/OTP delivery disabled until the owner separately approves provider activation and account-flow acceptance.
- Keep `OWNER_USER_ID` unset unless the numeric owner account ID is confirmed through the authorized configuration process. Never infer owner privileges from a username or email.
- Never commit secrets, provider keys, production database URLs, or user credentials.
- Do not enable delegated permissions, agents, schedules, payment actions, or moderation automation without an explicit owner-approved permission matrix and production acceptance.
- Android APK generation is manual-only and requires the owner's explicit approval. No release build is implied by a green CI run.

## Test preview

The [GitHub Pages web preview](https://mrobaei1.github.io/Royal-club/) is a test preview, not a production service. Registration, login, and online play depend on a reachable API and database.

For local development, see [Android development guide](docs/DEVELOPMENT-ANDROID.md) and [API deployment guide](docs/DEPLOY-API.md).

## Validation

Use GitHub Actions to inspect API build and integration tests, Flutter analysis and tests, backgammon engine audits, and web-preview builds. Always distinguish automated CI evidence from live API health, production deployment, and real-device acceptance.
