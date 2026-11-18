import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { ddb } from "../../shared/ddb";
import { keys, TABLE_NAME } from "../../shared/keys";
import { handler, json, getUserId, HttpError } from "../../shared/http";
import { applyCompletion, INITIAL_STREAK, toLocalDate, type StreakState } from "../../shared/domain/streak";
import { xpFor, levelForXp } from "../../shared/domain/xp";

/**
 * POST /tasks/{taskId}/complete
 * One TransactWriteItems: completion marker (conditional => idempotent), streak, XP ledger, XP total.
 * A repeated request fails the condition on the completion item and returns 409.
 */
export const complete = handler(async (event) => {
  const userId = getUserId(event);
  const taskId = event.pathParameters?.taskId;
  const goalId = event.queryStringParameters?.goalId;
  if (!taskId || !goalId) throw new HttpError(400, "taskId and goalId required");

  const table = TABLE_NAME();

  // Ownership: the goal key is scoped by userId.
  const goal = await ddb.send(new GetCommand({ TableName: table, Key: keys.goal(userId, goalId) }));
  if (!goal.Item) throw new HttpError(403, "Not your goal");

  const [user, streakRes, xpRes] = await Promise.all([
    ddb.send(new GetCommand({ TableName: table, Key: keys.user(userId) })),
    ddb.send(new GetCommand({ TableName: table, Key: keys.streak(userId) })),
    ddb.send(new GetCommand({ TableName: table, Key: keys.xp(userId) })),
  ]);

  const timeZone: string = user.Item?.timezone ?? "UTC";
  const now = new Date();
  const today = toLocalDate(now, timeZone);

  const prevStreak: StreakState = (streakRes.Item as StreakState | undefined) ?? INITIAL_STREAK;
  const { state: nextStreak, freezesConsumed } = applyCompletion(prevStreak, today);

  const gained = xpFor("TASK_COMPLETED");
  const prevXp: number = xpRes.Item?.totalXP ?? 0;
  const totalXP = prevXp + gained;

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: {
                ...keys.completion(userId, taskId),
                entity: "Completion",
                userId,
                taskId,
                goalId,
                date: today,
                completedAt: now.toISOString(),
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
          {
            Put: {
              TableName: table,
              Item: { ...keys.streak(userId), entity: "Streak", userId, ...nextStreak },
              // Optimistic concurrency: only write if streak is unchanged since we read it.
              ...(streakRes.Item
                ? {
                    ConditionExpression: "lastCompletedDate = :last AND currentStreak = :cur",
                    ExpressionAttributeValues: {
                      ":last": prevStreak.lastCompletedDate,
                      ":cur": prevStreak.currentStreak,
                    },
                  }
                : { ConditionExpression: "attribute_not_exists(PK)" }),
            },
          },
          {
            Put: {
              TableName: table,
              Item: {
                ...keys.xpLedger(userId, `task#${taskId}`),
                entity: "XpLedger",
                userId,
                event: "TASK_COMPLETED",
                amount: gained,
                createdAt: now.toISOString(),
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
          {
            Put: {
              TableName: table,
              Item: {
                ...keys.xp(userId),
                entity: "UserXP",
                userId,
                totalXP,
                currentLevel: levelForXp(totalXP),
                updatedAt: now.toISOString(),
              },
            },
          },
        ],
      })
    );
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      throw new HttpError(409, "Task already completed or concurrent update; retry", "CONFLICT");
    }
    throw err;
  }

  // Badge awarding / challenge progress should be triggered from DynamoDB Streams on the
  // Completion item, not inline here (see infrastructure stack for the stream wiring TODO).
  return json(200, {
    taskId,
    date: today,
    xpGained: gained,
    totalXP,
    streak: nextStreak,
    freezesConsumed,
  });
});
