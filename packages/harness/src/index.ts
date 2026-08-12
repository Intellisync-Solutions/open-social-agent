import {
  ConfigurationSnapshotSchema,
  DraftOutputSchema,
  EvidenceItemSchema,
  RunStateSchema,
  type ConfigurationSnapshot,
  type DraftEvaluation,
  type DraftOutput,
  type EvidenceItem,
  type ProviderExecutionResult,
  type ResearchExecutionResult,
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

export function buildEvidencePacket(input: {
  brief: string;
  evidence: EvidenceItem[];
}): string {
  const evidence = input.evidence.map((item) => EvidenceItemSchema.parse(item));
  const packet = JSON.stringify({
    evidence: evidence.map(({ id, url, title, domain, retrievedAt, publishedAt, contentHash }) => ({
      id, url, title, domain, retrievedAt, publishedAt, contentHash,
    })),
    researchBrief: input.brief,
  });
  if (packet.length > 64_000) throw new Error("CONTEXT_BUDGET_EXCEEDED");
  return packet;
}

export function evaluateDraft(input: {
  snapshot: ConfigurationSnapshot;
  output: DraftOutput;
  evidence: EvidenceItem[];
  recentBodies: string[];
}): DraftEvaluation {
  const snapshot = ConfigurationSnapshotSchema.parse(input.snapshot);
  const output = DraftOutputSchema.parse(input.output);
  const evidence = input.evidence.map((item) => EvidenceItemSchema.parse(item));
  const admitted = new Set(evidence.map((item) => item.id));
  const cited = output.sourceMap.flatMap((item) => item.evidenceIds);
  const codes = new Set<string>();
  const warnings = new Set<string>();
  if (snapshot.profile.research.citationsRequired && (evidence.length === 0 || cited.length === 0)) {
    codes.add("GROUNDING_INSUFFICIENT");
  }
  if (cited.some((id) => !admitted.has(id))) codes.add("CITATION_NOT_ADMITTED");
  if (snapshot.profile.research.citationsRequired && output.sourceMap.some((item) => item.evidenceIds.length === 0)) {
    codes.add("CLAIM_UNCITED");
  }
  if (snapshot.profile.research.citationsRequired && evidence.some((item) => item.publishedAt === null)) {
    warnings.add("FRESHNESS_UNVERIFIED");
  }
  const evaluatedAt = evidence.reduce((latest, item) => Math.max(latest, item.retrievedAt), 0);
  const freshnessFloor = evaluatedAt - snapshot.profile.research.freshnessDays * 86_400_000;
  if (evidence.some((item) => item.publishedAt !== null && item.publishedAt < freshnessFloor)) {
    codes.add("EVIDENCE_STALE");
  }
  if (!topicMatches(output.body, snapshot.profile.content.topics)) codes.add("TOPIC_MISMATCH");
  if (snapshot.profile.content.exclusions.some((term) => includesFolded(output.body, term))) {
    codes.add("EXCLUSION_VIOLATION");
  }
  const duplicateScore = input.recentBodies.reduce(
    (maximum, body) => Math.max(maximum, jaccard(output.body, body)),
    0,
  );
  if (duplicateScore >= 0.82) codes.add("DUPLICATE_RISK");
  return {
    state: codes.size === 0 ? "passed" : "blocked",
    codes: Array.from(codes).sort(),
    warnings: Array.from(warnings).sort(),
    duplicateScore,
    citedEvidenceIds: Array.from(new Set(cited)).sort(),
  };
}

export function evaluateHarnessExecution(input: {
  snapshot: ConfigurationSnapshot;
  research: ResearchExecutionResult | null;
  composition: ProviderExecutionResult;
  recentBodies: string[];
}): DraftEvaluation {
  const evaluation = evaluateDraft({
    snapshot: input.snapshot,
    output: input.composition.output,
    evidence: input.research?.evidence ?? [],
    recentBodies: input.recentBodies,
  });
  if ((input.research?.usage.totalTokens ?? 0) + input.composition.usage.totalTokens > input.snapshot.profile.model.perRunTokenGate) {
    evaluation.state = "blocked";
    evaluation.codes = Array.from(new Set([...evaluation.codes, "TOKEN_GATE_EXCEEDED"])).sort();
  }
  return evaluation;
}

function topicMatches(body: string, topics: string[]) {
  const words = new Set(tokens(body));
  return topics.some((topic) => tokens(topic).some((word) => words.has(word)));
}

function jaccard(left: string, right: string) {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function includesFolded(body: string, value: string) {
  return body.toLocaleLowerCase().includes(value.toLocaleLowerCase());
}

function tokens(value: string) {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 1) ?? [];
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

export function validateCompositionInput(
  snapshot: ConfigurationSnapshot,
  evidencePacket: string,
): ZeroPostPlan {
  const plan = planZeroPostRun(snapshot);
  if (
    snapshot.profile.research.citationsRequired &&
    evidencePacket.trim().length === 0
  ) {
    throw new Error("GROUNDING_INSUFFICIENT");
  }
  if (evidencePacket.length > 64_000) throw new Error("CONTEXT_BUDGET_EXCEEDED");
  return plan;
}
