import { encodingForModel } from "js-tiktoken";
import type { TokenEstimate } from "../types.js";

let encoder: ReturnType<typeof encodingForModel> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = encodingForModel("gpt-4o");
  }
  return encoder;
}

/** Count tokens in a string using cl100k_base. */
export function countTokens(text: string): number {
  if (!text) return 0;
  return getEncoder().encode(text).length;
}

/** Estimate tokens for a tool's description + schema. */
export function estimateToolTokens(
  description: string,
  inputSchema: Record<string, unknown>,
): TokenEstimate {
  const description_tokens = countTokens(description);
  const schema_tokens = countTokens(JSON.stringify(inputSchema));
  return {
    description_tokens,
    schema_tokens,
    total: description_tokens + schema_tokens,
  };
}

/** Model-specific scaling factors for token estimation. */
const MODEL_SCALE: Record<string, number> = {
  claude: 1.0,
  gpt: 1.0,
  gemini: 1.1,
};

export function getModelScale(model: string): number {
  const prefix = Object.keys(MODEL_SCALE).find((k) =>
    model.toLowerCase().startsWith(k),
  );
  return prefix ? MODEL_SCALE[prefix] : 1.0;
}
