/** Pure XP and level rules. Backend-authoritative; the client never assigns XP. */

export type XpEvent =
  | "TASK_COMPLETED"
  | "STREAK_7"
  | "QUIZ_COMPLETED"
  | "GOAL_FINISHED"
  | "CHALLENGE_COMPLETED";

export const XP_RULES: Record<XpEvent, number> = {
  TASK_COMPLETED: 10,
  STREAK_7: 50,
  QUIZ_COMPLETED: 20,
  GOAL_FINISHED: 100,
  CHALLENGE_COMPLETED: 75,
};

export function xpFor(event: XpEvent): number {
  return XP_RULES[event];
}

/** Level n requires 100 * n * (n - 1) / 2 total XP: 0, 100, 300, 600, ... */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (totalXp >= (100 * (level + 1) * level) / 2) level++;
  return level;
}
