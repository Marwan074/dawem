/** Deterministic, rule-driven badge criteria. Awarding is idempotent at the data layer. */

export interface BadgeContext {
  totalCompletions: number;
  currentStreak: number;
}

export interface BadgeRule {
  badgeId: string;
  name: string;
  isEarned: (ctx: BadgeContext) => boolean;
}

export const BADGE_RULES: BadgeRule[] = [
  {
    badgeId: "daily-starter",
    name: "Daily Starter",
    isEarned: (c) => c.totalCompletions >= 1,
  },
  {
    badgeId: "7-day-streak",
    name: "7-Day Streak",
    isEarned: (c) => c.currentStreak >= 7,
  },
];

export function earnedBadgeIds(ctx: BadgeContext): string[] {
  return BADGE_RULES.filter((r) => r.isEarned(ctx)).map((r) => r.badgeId);
}
