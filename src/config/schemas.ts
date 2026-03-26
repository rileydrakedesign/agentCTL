import { z } from "zod";

export const mcpServerConfigSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().optional(),
  type: z.enum(["stdio", "sse", "http"]).optional(),
  headers: z.record(z.string()).optional(),
  oauth: z.boolean().optional(),
});

export const mcpConfigSchema = z.object({
  mcpServers: z.record(mcpServerConfigSchema),
});

export const runtimeTargetSchema = z.object({
  model: z.string(),
  context_window: z.number().int().positive(),
});

export const projectConfigSchema = z.object({
  version: z.number().int().positive(),
  project: z.object({
    name: z.string().min(1),
  }),
  runtime_targets: z.array(runtimeTargetSchema).min(1),
});
