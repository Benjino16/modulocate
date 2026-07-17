import { z } from "zod";

const dateFields = z.object({
  name: z.string().min(1),
});

export const dateCreateInput = dateFields;

export const dateUpdateInput = z.object({
  id: z.uuid(),
  ...dateFields.partial().shape,
});

export type DateCreateInput = z.infer<typeof dateCreateInput>;
export type DateUpdateInput = z.infer<typeof dateUpdateInput>;
