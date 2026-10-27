import { z } from 'zod';

export const AUTH_COOKIES = { access: 'forma_access', refresh: 'forma_refresh' } as const;
export const CSRF_HEADER = 'x-csrf-protection';
export const sessionPresenceSchema = z.strictObject({ present: z.boolean() });
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const passwordSchema = z.string().min(12).max(128);
export const registerSchema = z.strictObject({
  email,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(80),
});
export const loginSchema = z.strictObject({ email, password: z.string().min(1).max(128) });
export const emailRequestSchema = z.strictObject({ email });
export const actionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const verifyEmailSchema = z.strictObject({
  token: actionTokenSchema,
  password: z.string().min(1).max(128),
});
export const resetPasswordSchema = z.strictObject({
  token: actionTokenSchema,
  newPassword: passwordSchema,
});
export const acceptedEmailSchema = z.strictObject({
  message: z.literal('If this address is eligible, an email will arrive shortly.'),
});
export const updateProfileSchema = z.strictObject({
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500),
  avatarMediaId: z.uuid().nullable(),
});
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export const userSchema = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  emailVerifiedAt: z.iso.datetime().nullable(),
  displayName: z.string(),
  bio: z.string(),
  avatarMediaId: z.uuid().nullable(),
  role: z.enum(['user', 'admin']),
  createdAt: z.iso.datetime(),
});
export const authSessionSchema = z.strictObject({
  user: userSchema,
  accessExpiresAt: z.iso.datetime(),
  sessionExpiresAt: z.iso.datetime(),
});
export const sessionListSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      createdAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      lastUsedAt: z.iso.datetime(),
      current: z.boolean(),
    }),
  ),
});
export type UserDto = z.infer<typeof userSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type EmailRequestInput = z.infer<typeof emailRequestSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
