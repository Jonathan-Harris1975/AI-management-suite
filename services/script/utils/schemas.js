import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import { z } from "zod";

export const SessionSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required")
});

export const IntroSchema = SessionSchema.extend({
  date: z.string().optional(), // YYYY-MM-DD
  prompt: z.string().optional()
});

export const MainSchema = SessionSchema.extend({
  rssUrl: z.string().url().optional(),
  maxItems: z.number().int().positive().max(20).optional(),
  prompt: z.string().optional()
});

export const OutroSchema = SessionSchema.extend({
  prompt: z.string().optional()
});

export const ComposeSchema = SessionSchema.extend({
  intro: z.string().optional(),
  main: z.array(z.string()).optional(),
  outro: z.string().optional(),
  editorPrompt: z.string().optional()
});

export const ClearSchema = SessionSchema;
