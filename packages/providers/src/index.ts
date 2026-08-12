import {
  DraftOutputSchema,
  modelPresetPolicies,
  type ConfigurationSnapshot,
  type ProviderExecutionResult,
} from "@open-social-agent/contracts";
import OpenAI from "openai";
import { z } from "zod";

export * from "./computer";
export * from "./research";

export const modelPresets = modelPresetPolicies;

export interface ProviderAdapter {
  compose(input: {
    apiKey: string;
    snapshot: ConfigurationSnapshot;
    evidencePacket: string;
  }): Promise<ProviderExecutionResult>;
}

export function createOpenAIProvider(options?: {
  baseURL?: string;
  clientFactory?: (apiKey: string, baseURL?: string) => OpenAI;
}): ProviderAdapter {
  const clientFactory =
    options?.clientFactory ??
    ((apiKey: string, baseURL?: string) => new OpenAI({ apiKey, baseURL }));
  return {
    async compose({ apiKey, snapshot, evidencePacket }) {
      const policy = snapshot.profile.model;
      const client = clientFactory(apiKey, options?.baseURL);
      const startedAt = Date.now();
      const response = await client.responses.create({
        model: policy.modelId,
        instructions: buildInstructions(snapshot),
        input: buildInput(snapshot, evidencePacket),
        max_output_tokens: policy.maxOutputTokens,
        reasoning: { effort: policy.reasoningEffort },
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "social_draft",
            strict: true,
            schema: providerJsonSchema(),
          },
        },
      });
      const output = DraftOutputSchema.parse(JSON.parse(response.output_text));
      return {
        responseId: response.id,
        requestedModel: policy.modelId,
        actualModel: response.model,
        output,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        latencyMs: Date.now() - startedAt,
        requestId: response._request_id ?? null,
      };
    },
  };
}

function providerJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(DraftOutputSchema, { target: "draft-7" });
  delete schema.$schema;
  return stripUnsupportedSchemaKeywords(schema) as Record<string, unknown>;
}

function stripUnsupportedSchemaKeywords(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsupportedSchemaKeywords);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      ["minLength", "maxLength", "maxItems", "format"].includes(key)
        ? []
        : [[key, stripUnsupportedSchemaKeywords(child)]],
    ),
  );
}

function buildInstructions(snapshot: ConfigurationSnapshot): string {
  const { content, research } = snapshot.profile;
  return [
    "Compose one social-media draft. Return only the requested structured object.",
    `Persona: ${content.persona}`,
    `Tone: ${content.tone}`,
    `Style: ${content.style}`,
    `Structure: ${content.structure}`,
    `Custom instructions: ${content.customInstructions || "none"}`,
    `Exclusions: ${content.exclusions.join(", ") || "none"}`,
    `Citations required: ${research.citationsRequired ? "yes" : "no"}`,
    "Never invent a source. Every source-map entry must cite admitted evidence IDs from the evidence packet.",
    "Do not attempt or describe browser actions, posting, authentication, or approval.",
  ].join("\n");
}

function buildInput(
  snapshot: ConfigurationSnapshot,
  evidencePacket: string,
): string {
  return [
    `Topics: ${snapshot.profile.content.topics.join(", ")}`,
    `Destination origin: ${snapshot.profile.destination.allowedOrigin}`,
    "Evidence packet:",
    evidencePacket || "No admitted evidence.",
  ].join("\n");
}
