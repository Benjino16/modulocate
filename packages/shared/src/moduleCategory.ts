import { z } from "zod";

const moduleCategoryFields = z.object({
  name: z.string().min(1),
});

export const moduleCategoryCreateInput = moduleCategoryFields;

export const moduleCategoryUpdateInput = z.object({
  id: z.uuid(),
  ...moduleCategoryFields.partial().shape,
});

export type ModuleCategoryCreateInput = z.infer<typeof moduleCategoryCreateInput>;
export type ModuleCategoryUpdateInput = z.infer<typeof moduleCategoryUpdateInput>;
