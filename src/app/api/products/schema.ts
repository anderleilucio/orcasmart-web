// src/app/api/products/schema.ts
import { z } from "zod";

export const productSchema = z.object({
  id: z.string().optional(),
  uid: z.string(),
  sku: z.string().min(1),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative(),
  active: z.boolean().optional(),
  images: z.array(z.string().url()).optional(),
});

export const bulkProductsSchema = z.object({
  items: z.array(productSchema).min(1),
});

export type ProductInput = z.infer<typeof productSchema>;