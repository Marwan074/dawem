# Streakly

AI-powered goal planning and habit tracking: a Flutter mobile app with a serverless AWS backend.

## Repository layout

```
.github/workflows/  CI: backend tests + typecheck, CDK synth
backend/            TypeScript Lambda handlers + pure domain logic (streak, XP, badges)
infrastructure/     AWS CDK stack: Cognito, DynamoDB, S3, HTTP API, Lambdas, alarm
```

Your existing Flutter app files (`lib/`, `android/`, `ios/`, `pubspec.yaml`, ...) can stay where
they are, or be moved into a `mobile/` folder.

## Backend quick start

```bash
cd backend && npm install && npm test && npm run typecheck
cd ../infrastructure && npm install && npx cdk synth -c stage=dev
npx cdk deploy -c stage=dev      # needs AWS credentials + `cdk bootstrap` once
```

## Implemented

- `POST /goals`, `GET /goals`, `GET /goals/{goalId}` (ownership via userId-scoped keys)
- `POST /tasks/{taskId}/complete?goalId=...`: one DynamoDB transaction writes an idempotent
  completion marker, streak update (optimistic concurrency) and XP ledger + total. Duplicate => 409.
- Pure streak engine (timezone-aware, with freezes), XP/level rules, badge rules.

## Next

1. Plan generation (async) behind an `AiProvider` interface.
2. DynamoDB Streams consumer: badges + challenge progress from Completion events.
3. Devices + SNS, reminder sweep (EventBridge Scheduler -> GSI1).
4. Files presign + Bedrock Knowledge Base ingestion/retrieval (filter by userId).
5. `GET /tasks/today`, `/streak`, `/progress`, `/xp`, `/badges`.

## Known gaps

- CORS is `*` on the API and the S3 bucket; restrict before production.
- Badges are not awarded yet (no Streams consumer).
- User `timezone` is read from the profile record; no endpoint creates it yet (falls back to UTC).
