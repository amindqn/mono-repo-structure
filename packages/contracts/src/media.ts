import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const storageSchema = z.enum(['database', 'object']);
export const mediaSchema = z.strictObject({
  id: z.uuid(),
  ownerId: z.uuid(),
  filename: z.string(),
  contentType: z.enum(MEDIA_TYPES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  storage: storageSchema,
  createdAt: z.iso.datetime(),
});
export const mediaListSchema = z.strictObject({ items: z.array(mediaSchema).max(100) });
export const mediaConfigSchema = z.strictObject({
  providers: z.array(storageSchema),
  maxUploadBytes: z.number(),
  contentTypes: z.array(z.string()),
});
export type MediaDto = z.infer<typeof mediaSchema>;
export type StorageKind = z.infer<typeof storageSchema>;
