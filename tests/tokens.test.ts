import { describe, it, expect } from "vitest";
import { countTokens, estimateToolTokens, getModelScale } from "../src/tokens/tokenizer.js";

describe("countTokens", () => {
  it("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("counts tokens in a simple string", () => {
    const count = countTokens("Create a new GitHub issue with the given title and body");
    expect(count).toBeGreaterThan(5);
    expect(count).toBeLessThan(20);
  });
});

describe("estimateToolTokens", () => {
  it("estimates description + schema tokens", () => {
    const estimate = estimateToolTokens("Search for code in a repository", {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        repo: { type: "string", description: "Repository name" },
      },
      required: ["query"],
    });

    expect(estimate.description_tokens).toBeGreaterThan(0);
    expect(estimate.schema_tokens).toBeGreaterThan(0);
    expect(estimate.total).toBe(estimate.description_tokens + estimate.schema_tokens);
  });
});

describe("getModelScale", () => {
  it("returns 1.0 for claude models", () => {
    expect(getModelScale("claude-sonnet-4-6")).toBe(1.0);
  });

  it("returns 1.0 for gpt models", () => {
    expect(getModelScale("gpt-4o")).toBe(1.0);
  });

  it("returns 1.1 for gemini models", () => {
    expect(getModelScale("gemini-pro")).toBe(1.1);
  });

  it("returns 1.0 for unknown models", () => {
    expect(getModelScale("llama-3")).toBe(1.0);
  });
});
