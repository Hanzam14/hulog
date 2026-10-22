import { useEffect } from "react";
import type { Snapshot } from "../data";
import { celebrationId, goalReached, type GoalRef } from "../streaks";
import { celebrateGoal } from "./confetti";

/** Celebrate a goal once per device the first time the viewer sees it reached (spec 10.8). */
export function useGoalCelebration(
  data: Snapshot,
  ref: GoalRef,
  viewer: string | undefined,
) {
  const reached = viewer !== undefined && goalReached(data, ref, viewer);
  const id = celebrationId(ref);
  useEffect(() => {
    if (reached) celebrateGoal(id, data);
  }, [reached, id, data]);
}
