# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # install dependencies
pnpm run start:dev    # run in watch mode (development)
pnpm run build        # compile to dist/
pnpm run lint         # ESLint + Prettier (auto-fixes)
pnpm run test         # unit tests (Jest)
pnpm run test:e2e     # end-to-end tests
pnpm run test:cov     # unit tests with coverage report
```

Run a single unit test file:
```bash
pnpm run test -- --testPathPattern=app.controller
```

## Architecture

Standard NestJS application. Each feature is organized as a **module** (`@Module`) that declares its own controllers and providers, then imported into `AppModule`.

- `src/main.ts` — bootstraps the app on `PORT` (default 3000)
- `src/app.module.ts` — root module; import all feature modules here
- Controllers (`@Controller`) handle HTTP routing; Services (`@Injectable`) hold business logic and are injected via the constructor.

Unit tests (`*.spec.ts`) live alongside their source files in `src/`. E2E tests live in `test/` and use a separate Jest config (`test/jest-e2e.json`).

## TypeScript config notes

- `noImplicitAny` is **off** — untyped code won't error.
- `emitDecoratorMetadata` and `experimentalDecorators` are enabled (required for NestJS DI).
- ESLint enforces Prettier formatting; `prettier/prettier` is set to `error`.
