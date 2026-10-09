/**
 * [GAME] PURE eligibility check, not a portal action. The magical seventh-floor
 * threshold is absent from the ordinary pathfinding graph until a dedicated
 * actor-scoped visibility/access and save-state system exists.
 */
export type RequirementApproach = {
  atSeventhFloorEntrance: boolean;
  focusedNeed: string | null;
  /** Relevant need established by world facts, not merely user-supplied text. */
  needSupportedByWorld: boolean;
  consecutivePasses: number;
};
export function canManifestRoomOfRequirement(attempt: RequirementApproach): boolean {
  return attempt.atSeventhFloorEntrance &&
    attempt.needSupportedByWorld &&
    (attempt.focusedNeed?.trim().length ?? 0) > 0 &&
    Number.isSafeInteger(attempt.consecutivePasses) &&
    attempt.consecutivePasses >= 3;
}
