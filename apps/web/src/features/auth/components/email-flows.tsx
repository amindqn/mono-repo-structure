'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import { actionTokenSchema, emailRequestSchema, passwordSchema } from '@repo/contracts';
import { apiClient } from '@/lib/api-client';
import { useSession } from '@/lib/session';
import { AuthFrame } from './auth-frame';

const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Unable to connect. Please try again.';
function AuthHelp() {
  return (
    <nav className="auth-help" aria-label="Account help">
      <Link href="/">Back to sign in</Link>
      <Link href="/resend-verification">Request verification email</Link>
      <Link href="/forgot-password">Request password reset</Link>
    </nav>
  );
}

export function EmailRequestForm({ kind }: { kind: 'verification' | 'password' }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      kind === 'verification'
        ? apiClient.resendVerification({ email })
        : apiClient.forgotPassword({ email }),
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!emailRequestSchema.safeParse({ email }).success) {
      setError('Enter a valid email address.');
      return;
    }
    try {
      await mutation.mutateAsync();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <AuthFrame>
      <section className="auth-card" aria-labelledby="email-title">
        <p className="eyebrow">A LITTLE HELP GETTING BACK</p>
        <h2 id="email-title">
          {kind === 'verification' ? 'Confirm it’s you.' : 'Forgot your password?'}
        </h2>
        <p className="intro-copy">
          {kind === 'verification'
            ? 'Request a new link to verify your email address.'
            : 'We’ll email a secure link so you can choose a new password.'}
        </p>
        <form
          className="settings-form"
          onSubmit={(event) => {
            void submit(event);
          }}
          aria-busy={mutation.isPending}
        >
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={mutation.isPending}
            />
          </label>
          <button type="submit" className="primary-button" disabled={mutation.isPending}>
            {mutation.isPending ? 'Please wait…' : 'Send email'}
          </button>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {mutation.isSuccess && !error && (
            <p role="status" className="form-notice">
              {mutation.data.message} Check your inbox and spam folder. Wait a minute before
              requesting another email.
            </p>
          )}
        </form>
        <AuthHelp />
      </section>
    </AuthFrame>
  );
}

export function EmailActionForm({ kind }: { kind: 'verification' | 'password' }) {
  const token = useRef('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { signedOut } = useSession();
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!value) return;
    window.history.replaceState(null, '', window.location.pathname);
    token.current = value;
  }, []);
  const mutation = useMutation({
    mutationFn: async () => {
      if (kind === 'verification') await apiClient.verifyEmail(token.current, password);
      else {
        await apiClient.resetPassword({ token: token.current, newPassword: password });
        await signedOut('Password reset. Sign in with your new password.');
      }
      token.current = '';
      setPassword('');
      setConfirm('');
    },
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!actionTokenSchema.safeParse(token.current).success) {
      setError('This link is missing or invalid. Request a new email below.');
      return;
    }
    if (
      kind === 'password' &&
      (!passwordSchema.safeParse(password).success || password !== confirm)
    ) {
      setError('Use 12–128 characters and enter the same password in both fields.');
      return;
    }
    try {
      await mutation.mutateAsync();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <AuthFrame>
      <section className="auth-card" aria-labelledby="action-title">
        <p className="eyebrow">YOUR NEXT STEP</p>
        <h2 id="action-title">
          {kind === 'verification' ? 'Verify your email.' : 'Choose a new password.'}
        </h2>
        <p className="intro-copy">
          {kind === 'verification'
            ? 'Enter the account password you chose when registering to confirm this email. If you did not create the account, use password recovery first.'
            : 'Resetting your password signs out every active session.'}
        </p>
        {mutation.isSuccess ? (
          <p role="status" className="form-notice">
            {kind === 'verification'
              ? 'Your email is verified. You can now sign in.'
              : 'Your password is reset. Sign in with your new password.'}
          </p>
        ) : (
          <form
            className="settings-form"
            onSubmit={(event) => {
              void submit(event);
            }}
            aria-busy={mutation.isPending}
          >
            {kind === 'verification' && (
              <label>
                Your account password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={mutation.isPending}
                />
              </label>
            )}
            {kind === 'password' && (
              <>
                <label>
                  New password
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={mutation.isPending}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    disabled={mutation.isPending}
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? 'Hide passwords' : 'Show passwords'}
                </button>
                <small>Use 12–128 characters. Password managers and paste are welcome.</small>
              </>
            )}
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <button type="submit" className="primary-button" disabled={mutation.isPending}>
              {mutation.isPending
                ? 'Please wait…'
                : kind === 'verification'
                  ? 'Verify email'
                  : 'Reset password'}
            </button>
          </form>
        )}
        <AuthHelp />
      </section>
    </AuthFrame>
  );
}
