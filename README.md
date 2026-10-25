# Royal Club — starter scaffold

Status: actively developed in `feature/password-min-6`. This branch is not a production deployment; validate the current CI run before merging.

## Contents
- `apps/mobile`: Flutter/Dart starter source (Android-first UI entry point)
- `apps/api`: TypeScript + Fastify API with health endpoint and PostgreSQL connectivity check
- `infra/docker-compose.yml`: local PostgreSQL service
- `docs/DEVELOPMENT-ANDROID.md`: phone-first cloud development workflow

## Current implemented modules
- Authentication and profile endpoints
- Friends, notifications, online-match APIs, and backgammon rules
- Non-transferable wallet-credit ledger and subscription activation
- Owner-only mobile admin screen for crediting a user and editing/enabling subscription plans

## Owner admin configuration
Set `OWNER_USER_ID` in the API environment to the numeric `users.id` of the owner. Leave it unset to keep owner-only operations disabled. The admin screen checks `/api/v1/admin/status`, and the server independently enforces owner authorization on every administrative write. Do not use an email address or expose this setting in the client app.

## Quick start (cloud IDE or computer)
1. Import this folder/repository into a cloud IDE with a terminal (see `docs/DEVELOPMENT-ANDROID.md`).
2. Start PostgreSQL with `docker compose -f infra/docker-compose.yml up -d db` where Docker is supported.
3. API: `cd apps/api && cp .env.example .env && npm install && npm run dev`
4. Check `GET /api/v1/health` and `GET /api/v1/health/db`.
5. Flutter: in an environment with Flutter installed, from `apps/mobile`, run `flutter create . --platforms=android,web` if platform wrapper files are missing, then `flutter pub get` and `flutter run`.

Never put production secrets in source control. The included credentials are for local development only.
