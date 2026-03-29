import { z } from "zod";

export const createOrUpdateClipSchema = z.object({
  password: z.string().min(1).max(256),
  text: z.string().max(2_000_000).optional().default(""),
  expiresInSeconds: z.number().int().positive().nullable().optional().default(null),
  destroyOnRead: z.boolean().optional().default(false),
});

export const readClipSchema = z.object({
  password: z.string().min(1).max(256),
});
