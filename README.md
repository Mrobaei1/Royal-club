# Royal Club — starter scaffold

Status: source scaffold created in this workspace. It has **not** been deployed, and the Flutter app has not been built or run here because Flutter/Dart are not installed in this environment.

## Contents
- `apps/mobile`: Flutter/Dart starter source (Android-first UI entry point)
- `apps/api`: TypeScript + Fastify API with health endpoint and PostgreSQL connectivity check
- `infra/docker-compose.yml`: local PostgreSQL service
- `docs/DEVELOPMENT-ANDROID.md`: phone-first cloud development workflow

## Quick start (cloud IDE or computer)
1. Import this folder/repository into a cloud IDE with a terminal (see `docs/DEVELOPMENT-ANDROID.md`).
2. Start PostgreSQL with `docker compose -f infra/docker-compose.yml up -d db` where Docker is supported.
3. API: `cd apps/api && cp .env.example .env && npm install && npm run dev`
4. Check `GET /api/v1/health` and `GET /api/v1/health/db`.
5. Flutter: in an environment with Flutter installed, from `apps/mobile`, run `flutter create . --platforms=android,web` if platform wrapper files are missing, then `flutter pub get` and `flutter run`.

Never put production secrets in source control. The included credentials are for local development only.
