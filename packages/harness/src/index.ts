import {
  ConfigurationSnapshotSchema,
  RunStateSchema,
  type ConfigurationSnapshot,
  type RunState,
} from "@open-social-agent/contracts";

const transitions: Readonly<Record<RunState, readonly RunState[]>> = {
  queued: ["claimed", "cancelled"],
  claimed: ["researching", "blocked", "failed", "cancelled"],
  researching: ["composing", "blocked", "failed", "cancelled"],
  composing: ["evaluating", "blocked", "failed", "cancelled"],
  evaluating: ["awaiting_approval", "blocked", "failed", "rejected"],
  awaiting_approval: ["approved", "rejected", "cancelled"],
  approved: ["executing", "cancelled"],
  executing: ["verifying", "blocked", "failed"],
  verifying: ["live", "pending", "blocked", "failed"],
  live: [],
  pending: [],
  blocked: [],
  failed: [],
  rejected: [],
  cancelled: [],
};

export function assertRunTransition(from: RunState, to: RunState): void {
  RunStateSchema.parse(from);
  RunStateSchema.parse(to);
  if (!transitions[from].includes(to)) {
    throw new Error("RUN_TRANSITION_INVALID");
  }
}

export type ZeroPostPlan = {
  mode: "zero-post";
  contextBudget: number;
  outputBudget: number;
  selectedTools: string[];
  skippedTools: Array<{ tool: string; reason: string }>;
  nextState: "claimed";
  externalWrites: 0;
};

export function planZeroPostRun(
  snapshot: ConfigurationSnapshot,
): ZeroPostPlan {
  const parsed = ConfigurationSnapshotSchema.parse(snapshot);
  if (
    parsed.profile.model.maxOutputTokens >
    parsed.profile.model.perRunTokenGate
  ) {
    throw new Error("BUDGET_DENIED");
  }
  const selectedTools = parsed.profile.research.webSearchEnabled
    ? ["web_search"]
    : [];
  return {
    mode: "zero-post",
    contextBudget:
      parsed.profile.model.perRunTokenGate -
      parsed.profile.model.maxOutputTokens,
    outputBudget: parsed.profile.model.maxOutputTokens,
    selectedTools,
    skippedTools: [
      { tool: "provider_generation", reason: "ZERO_POST_MODE" },
      { tool: "computer", reason: "APPROVAL_REQUIRED" },
      { tool: "publication", reason: "APPROVAL_REQUIRED" },
    ],
    nextState: "claimed",
    externalWrites: 0,
  };
}
