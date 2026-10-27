'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthFrame } from './auth-frame';
import type { FormEvent, ReactNode } from 'react';
import { loginSchema, registerSchema } from '@repo/contracts';
import { ApiError } from '@repo/api-client';
import { useSession } from '@/lib/session';
import { Icon } from '@/components/icon';

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, user } = useSession();
  if (session.isPending || (!user && session.isFetching))
    return (
      <main className="auth-loading" role="status">
        Opening your workspace…
      </main>
    );
  if (session.isError)
    return (
      <main className="fallback">
        <h1>We couldn’t reach your workspace.</h1>
        <p>Check your connection and try again.</p>
        <button
          className="primary-button"
          onClick={() => {
            void session.refetch();
          }}
        >
          Try again
        </button>
      </main>
    );
  if (!user) return <AuthForm />;
  return children;
}

function AuthForm() {
  const { login, register, notice } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fields, setFields] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const pending = login.isPending || register.isPending;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const input =
      mode === 'register'
        ? registerSchema.safeParse(fields)
        : loginSchema.safeParse({ email: fields.email, password: fields.password });
    if (!input.success) {
      setError(
        mode === 'register'
          ? 'Use a valid email, a name of 2–80 characters, and a password of 12–128 characters.'
          : 'Enter your email and password.',
      );
      return;
    }
    try {
      if (mode === 'register') {
        const result = await register.mutateAsync(registerSchema.parse(fields));
        setConfirmation(result.message + ' Open the verification link, then sign in.');
        setFields({ ...fields, password: '' });
        setMode('login');
      } else
        await login.mutateAsync(
          loginSchema.parse({ email: fields.email, password: fields.password }),
        );
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Unable to connect. Please try again.');
    }
  }
  return (
    <AuthFrame>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">WELCOME TO FORMA</p>
        <h2 id="auth-title">
          {mode === 'login' ? 'Pick up where you left off.' : 'Make room for what’s next.'}
        </h2>
        <p className="intro-copy">
          {mode === 'login'
            ? 'Sign in to your personal workspace.'
            : 'Create your account and start building.'}
        </p>
        <div className="auth-tabs" role="group" aria-label="Account action">
          <button
            aria-pressed={mode === 'login'}
            onClick={() => {
              setMode('login');
              setError('');
            }}
            disabled={pending}
          >
            Sign in
          </button>
          <button
            aria-pressed={mode === 'register'}
            onClick={() => {
              setMode('register');
              setError('');
            }}
            disabled={pending}
          >
            Create account
          </button>
        </div>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          className="settings-form"
          aria-busy={pending}
        >
          {mode === 'register' && (
            <label>
              Your name
              <input
                value={fields.displayName}
                autoComplete="name"
                minLength={2}
                maxLength={80}
                required
                disabled={pending}
                onChange={(event) => setFields({ ...fields, displayName: event.target.value })}
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={fields.email}
              disabled={pending}
              onChange={(event) => setFields({ ...fields, email: event.target.value })}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 12 : 1}
              maxLength={128}
              required
              value={fields.password}
              disabled={pending}
              onChange={(event) => setFields({ ...fields, password: event.target.value })}
            />
          </label>
          {mode === 'register' && (
            <small>Use 12–128 characters. Password managers and paste are welcome.</small>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            <Icon name="arrow" size={17} />
          </button>
          {(confirmation || notice) && (
            <p className="form-notice" role="status">
              {confirmation || notice}
            </p>
          )}
        </form>
        <nav className="auth-help" aria-label="Sign-in help">
          <Link href="/forgot-password">Forgot password?</Link>
          <Link href="/resend-verification">Resend verification email</Link>
        </nav>
      </section>
    </AuthFrame>
  );
}
