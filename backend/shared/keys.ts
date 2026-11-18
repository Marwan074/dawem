/** Single-table key builders. Keep every key format in one place. */

export const keys = {
  user: (userId: string) => ({ PK: `USER#${userId}`, SK: "PROFILE" }),
  goal: (userId: string, goalId: string) => ({ PK: `USER#${userId}`, SK: `GOAL#${goalId}` }),
  task: (goalId: string, date: string) => ({ PK: `GOAL#${goalId}`, SK: `TASK#${date}` }),
  completion: (userId: string, taskId: string) => ({ PK: `USER#${userId}`, SK: `COMPLETION#${taskId}` }),
  streak: (userId: string) => ({ PK: `USER#${userId}`, SK: "STREAK" }),
  xp: (userId: string) => ({ PK: `USER#${userId}`, SK: "XP" }),
  xpLedger: (userId: string, eventKey: string) => ({ PK: `USER#${userId}`, SK: `XPLEDGER#${eventKey}` }),
  userBadge: (userId: string, badgeId: string) => ({ PK: `USER#${userId}`, SK: `BADGE#${badgeId}` }),
  device: (userId: string, deviceId: string) => ({ PK: `USER#${userId}`, SK: `DEVICE#${deviceId}` }),
};

export const TABLE_NAME = () => {
  const name = process.env.TABLE_NAME;
  if (!name) throw new Error("TABLE_NAME is not set");
  return name;
};
