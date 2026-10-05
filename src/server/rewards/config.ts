import "server-only";

/** Reward engine configuration (all optional; publishing is disabled without OPERATOR_PRIVATE_KEY). */
export const rewardsEnv = {
  operatorKey: (process.env.OPERATOR_PRIVATE_KEY || "") as `0x${string}` | "",
  lotterySecret: process.env.LOTTERY_SECRET || "",
  /** Lottery eligibility: at least one qualifying game event within the last N UTC days (inclusive). */
  activityDays: Math.max(1, Math.min(30, Number(process.env.LOTTERY_ACTIVITY_DAYS || 7))),
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
};

export const canPublish = () => Boolean(rewardsEnv.operatorKey && rewardsEnv.lotterySecret);
