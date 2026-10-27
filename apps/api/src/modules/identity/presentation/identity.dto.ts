import {
  acceptedEmailSchema,
  emailRequestSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  authSessionSchema,
  changePasswordSchema,
  loginSchema,
  registerSchema,
  sessionListSchema,
  sessionPresenceSchema,
  updateProfileSchema,
  userSchema,
} from '@repo/contracts';
import { createZodDto } from 'nestjs-zod';
export class RegisterDto extends createZodDto(registerSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class ProfileDto extends createZodDto(updateProfileSchema) {}
export class PasswordDto extends createZodDto(changePasswordSchema) {}
export class UserDto extends createZodDto(userSchema) {}
export class AuthSessionDto extends createZodDto(authSessionSchema) {}
export class SessionListDto extends createZodDto(sessionListSchema) {}
export class SessionPresenceDto extends createZodDto(sessionPresenceSchema) {}
export class AcceptedEmailDto extends createZodDto(acceptedEmailSchema) {}
export class EmailRequestDto extends createZodDto(emailRequestSchema) {}
export class VerifyEmailDto extends createZodDto(verifyEmailSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
