# Streakly Infrastructure (AWS CDK)

Serverless AWS infrastructure for **Streakly** built with **AWS CDK (TypeScript)** targeting region **`eu-north-1`**.

## Architecture Overview

100% Serverless (no VPC or NAT Gateways to minimize operational overhead and idle cost):

| Layer | AWS Service | Key Configuration |
|---|---|---|
| **Identity** | Amazon Cognito | User Pool (`email` sign-in, SRP auth) + Public `MobileClient` |
| **API** | API Gateway (HTTP API v2) | Cognito JWT Authorizer, CORS (`GET, POST, PUT, DELETE`), Throttling (50 burst / 25 RPS), JSON Access Logs (30-day retention) |
| **Compute** | AWS Lambda (18 functions) | Node.js 24 (`esbuild` bundled), 256MB–512MB, X-Ray Active Tracing, Least-Privilege IAM, 30-day CloudWatch Log Groups |
| **Database** | Amazon DynamoDB | Single-table (`PK`/`SK` + `GSI1`), `PAY_PER_REQUEST`, Streams (`NEW_IMAGE`), PITR enabled in `prod` |
| **Storage** | Amazon S3 | Private `LearningFiles` bucket (`BLOCK_ALL`, `SSE-S3`, `enforceSSL: true`) for RAG phase |
| **Async & Scheduling** | DynamoDB Streams, SQS, EventBridge | Filtered Stream -> `StreamConsumer` -> SQS `StreamDlq` (14-day retention, `enforceSSL: true`); EventBridge 15-min `ReminderSchedule` |
| **Observability** | CloudWatch & SNS | `Streakly-<stage>` Dashboard, 4 CloudWatch Alarms, SNS `AlertsTopic` (`enforceSSL: true`) |
| **Security & Policy** | `cdk-nag` | `AwsSolutionsChecks` executed on `cdk synth` via `validateScope` |

## Prerequisites

- **Node.js 24** (`node -v`)
- **AWS CLI v2** configured for account/region (`eu-north-1`)
- Dependencies installed in both `backend/` and `infrastructure/`:

```bash
cd backend && npm ci
cd ../infrastructure && npm ci