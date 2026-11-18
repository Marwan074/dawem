import { randomUUID } from "node:crypto";
import { PutCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { ddb } from "../../shared/ddb";
import { keys, TABLE_NAME } from "../../shared/keys";
import { handler, json, parseBody, getUserId, HttpError } from "../../shared/http";

const CreateGoal = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  durationDays: z.number().int().min(1).max(365),
  dailyMinutes: z.number().int().min(5).max(600),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  level: z.enum(["beginner", "intermediate", "advanced"]),
});

export const create = handler(async (event) => {
  const userId = getUserId(event);
  const input = parseBody(event, CreateGoal);
  const goalId = randomUUID();
  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME(),
      Item: {
        ...keys.goal(userId, goalId),
        entity: "Goal",
        goalId,
        userId,
        ...input,
        status: "PLAN_PENDING",
        createdAt: now,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    })
  );
  return json(201, { goalId, status: "PLAN_PENDING" });
});

export const list = handler(async (event) => {
  const userId = getUserId(event);
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":sk": "GOAL#" },
    })
  );
  return json(200, { goals: res.Items ?? [] });
});

export const get = handler(async (event) => {
  const userId = getUserId(event);
  const goalId = event.pathParameters?.goalId;
  if (!goalId) throw new HttpError(400, "goalId required");
  // Key includes userId, so another user's goalId simply won't resolve (ownership by construction).
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME(), Key: keys.goal(userId, goalId) })
  );
  if (!res.Item) throw new HttpError(404, "Goal not found");
  return json(200, res.Item);
});
