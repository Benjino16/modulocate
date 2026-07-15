import { z } from "zod";

export const moduleSchema = z.object({
  title: z.string().min(1),
  capacity: z.number().int().positive(),
});

export type ModuleInput = z.infer<typeof moduleSchema>;