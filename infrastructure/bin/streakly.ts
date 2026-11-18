#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { StreaklyStack } from "../lib/streakly-stack";

const app = new cdk.App();
const stage = app.node.tryGetContext("stage") ?? "dev";

new StreaklyStack(app, `Streakly-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
