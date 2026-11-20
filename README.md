# Streakly

AI-powered goal planning and habit tracking: a Flutter mobile app with a serverless AWS backend.

## Repository layout

```
.github/workflows/  CI: backend tests + typecheck, CDK synth
backend/            TypeScript Lambda handlers + pure domain logic
infrastructure/     AWS CDK stack: Cognito, DynamoDB, S3, HTTP API, Lambdas, Streams consumer, schedule
```

Your existing Flutter app files can stay where they are, or move into `mobile/`.

## Quick start

```bash
cd backend && npm install && npm test && npm run typecheck
cd ../infrastructure && npm install && npx cdk synth -c stage=dev
npx cdk deploy -c stage=dev      # needs AWS credentials + `cdk bootstrap` once
```

## API (all routes need a Cognito JWT)

| Method | Path | Purpose |
|---|---|---|
| GET / PUT | `/me` | Profile: `timezone` (required first time), `displayName`, `remindersEnabled`, `reminderTime` (HH:mm, 15-min steps) |
| POST / GET | `/goals`, `/goals/{goalId}` | Create / list / read goals |
| POST | `/goals/{goalId}/tasks` | Add a task for a date |
| GET | `/tasks/today` | Today's tasks (user's timezone) with completed flags |
| POST | `/tasks/{taskId}/complete?goalId=` | Complete a task: streak + XP in one transaction (409 on repeat) |
| GET | `/streak`, `/xp`, `/badges` | Streak (lapsed reads 0), XP + level, badge catalog with earned state |
| POST / GET | `/challenges`, `/challenges/{id}/join` | Create (individual/group), join, list with own progress |
| PUT / DELETE | `/devices/{deviceId}` | Register/refresh or remove an FCM token (SNS endpoint) |

Calls that depend on "today" return `409 PROFILE_REQUIRED` until `PUT /me` has been called.

## Background processing

- **Streams consumer**: every new Completion item awards badges (+ bonus XP) and advances the user's
  challenge progress. All writes are conditional, so redelivery is safe; failures go to a DLQ (with an alarm).
- **Reminders**: an EventBridge rule runs every 15 minutes. Users are indexed by their local reminder
  slot, then matched in their own timezone (DST-safe). At most one reminder per user per day, only when
  tasks are incomplete.

## Push notifications setup (one-time)

1. In SNS, create a platform application for FCM with your Firebase credentials.
2. Deploy with its ARN: `npx cdk deploy -c stage=dev -c platformApplicationArn=arn:aws:sns:REGION:ACCOUNT:app/GCM/NAME`
3. In the app, call `PUT /devices/{deviceId}` after login with the FCM token; `DELETE` on logout.

Without the ARN the API still works; devices are stored and `pushEnabled` is false.

## Next

1. Plan generation (async) behind an `AiProvider` interface.
2. Files presign + Bedrock Knowledge Base ingestion/retrieval (filter by userId).
3. Leaderboards, friends.

## Known gaps

- CORS is `*` on the API and the S3 bucket; restrict before production.
- Handlers are covered by typecheck and `cdk synth`, and the pure rules by unit tests; the DynamoDB/SNS
  paths have not been run against real AWS yet. Run an end-to-end pass on a dev stack first.
- The SNS FCM payload format (`fcmV1Message`) must match your platform application type; check on first send.
