'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import { changePasswordSchema, updateProfileSchema } from '@repo/contracts';
import type { UserDto } from '@repo/contracts';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { useSession } from '@/lib/session';
import { WorkspaceShell } from '@/components/workspace-shell';

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
export function AccountSettings() {
  const { user } = useSession();
  return (
    <WorkspaceShell section="account">
      <section className="page-intro">
        <div>
          <p className="eyebrow">MAKE IT YOURS</p>
          <h1>
            Your account<span>.</span>
          </h1>
          <p className="intro-copy">A few details that make this space feel like you.</p>
        </div>
      </section>
      {user && (
        <div className="settings-grid">
          <ProfileForm user={user} />
          <PasswordForm />
          <SessionSettings userId={user.id} />
        </div>
      )}
    </WorkspaceShell>
  );
}
function ProfileForm({ user }: { user: UserDto }) {
  const { updateUser } = useSession();
  const [fields, setFields] = useState({
    displayName: user.displayName,
    bio: user.bio,
    avatarMediaId: user.avatarMediaId,
  });
  const [error, setError] = useState('');
  const media = useQuery({
    queryKey: queryKeys.media(user.id),
    queryFn: ({ signal }) => apiClient.listMedia(signal),
  });
  const mutation = useMutation({
    mutationFn: () => apiClient.updateProfile(updateProfileSchema.parse(fields)),
    onSuccess: (profile) => {
      updateUser(profile);
      setFields({
        displayName: profile.displayName,
        bio: profile.bio,
        avatarMediaId: profile.avatarMediaId,
      });
    },
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!updateProfileSchema.safeParse(fields).success) {
      setError('Use a name of 2–80 characters and a bio up to 500 characters.');
      return;
    }
    try {
      await mutation.mutateAsync();
    } catch (error) {
      setError(message(error));
    }
  }
  return (
    <section className="settings-card" aria-labelledby="profile-title">
      <h2 id="profile-title">Personal profile</h2>
      <p className="section-description">Your name, a little about you, and a familiar face.</p>
      <form
        className="settings-form"
        onSubmit={(event) => {
          void submit(event);
        }}
        aria-busy={mutation.isPending}
      >
        <label>
          Display name
          <input
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            value={fields.displayName}
            onChange={(event) => setFields({ ...fields, displayName: event.target.value })}
          />
        </label>
        <label>
          Sign-in email
          <input type="email" value={user.email} readOnly />
        </label>
        <label>
          Bio
          <textarea
            maxLength={500}
            rows={4}
            value={fields.bio}
            onChange={(event) => setFields({ ...fields, bio: event.target.value })}
          />
        </label>
        <label>
          Profile image
          <select
            value={fields.avatarMediaId ?? ''}
            onChange={(event) =>
              setFields({ ...fields, avatarMediaId: event.target.value || null })
            }
          >
            <option value="">No profile image</option>
            {media.data?.items
              .filter((item) => item.contentType.startsWith('image/'))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.filename}
                </option>
              ))}
          </select>
        </label>
        <small>
          Choose one of your images, or{' '}
          <Link href="/media">upload an image in your media library</Link>.
        </small>
        {fields.avatarMediaId && (
          <img
            className="profile-preview"
            src={`/api/v1/media/${fields.avatarMediaId}/content`}
            alt="Selected profile image"
            width={72}
            height={72}
          />
        )}
        <button className="primary-button" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Saving…' : 'Save profile'}
        </button>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {mutation.isSuccess && !error && (
          <p className="form-notice" role="status">
            Your profile is saved.
          </p>
        )}
      </form>
    </section>
  );
}
function PasswordForm() {
  const { signedOut, user } = useSession();
  const [fields, setFields] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () => apiClient.changePassword(changePasswordSchema.parse(fields)),
    onSuccess: () => signedOut('Password updated. Sign in again with your new password.'),
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!changePasswordSchema.safeParse(fields).success) {
      setError('Enter your current password and a new password of 12–128 characters.');
      return;
    }
    try {
      await mutation.mutateAsync();
    } catch (error) {
      setError(message(error));
    }
  }
  return (
    <section className="settings-card" aria-labelledby="password-title">
      <h2 id="password-title">Password & security</h2>
      <p className="section-description">Changing your password signs out every active session.</p>
      <form
        className="settings-form"
        onSubmit={(event) => {
          void submit(event);
        }}
        aria-busy={mutation.isPending}
      >
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={user?.email ?? ''}
          readOnly
          hidden
        />
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            value={fields.currentPassword}
            onChange={(event) => setFields({ ...fields, currentPassword: event.target.value })}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={fields.newPassword}
            onChange={(event) => setFields({ ...fields, newPassword: event.target.value })}
          />
        </label>
        <button className="secondary-button" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Updating…' : 'Update password'}
        </button>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
function SessionSettings({ userId }: { userId: string }) {
  const client = useQueryClient();
  const sessions = useQuery({
    queryKey: queryKeys.sessions(userId),
    queryFn: ({ signal }) => apiClient.sessions(signal),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiClient.revokeSession(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.sessions(userId) }),
  });
  return (
    <section className="settings-card sessions-card" aria-labelledby="sessions-title">
      <h2 id="sessions-title">Active sessions</h2>
      <p className="section-description">
        Review your signed-in sessions and sign out the ones you no longer need.
      </p>
      {sessions.isPending ? (
        <p role="status">Loading sessions…</p>
      ) : sessions.isError ? (
        <p className="inline-error" role="alert">
          {message(sessions.error)}
        </p>
      ) : (
        <ul className="session-list">
          {sessions.data.items.map((session) => (
            <li key={session.id}>
              <div>
                <strong>{session.current ? 'This session' : 'Another signed-in session'}</strong>
                <small>
                  Started {new Date(session.createdAt).toLocaleString()} · Expires{' '}
                  {new Date(session.expiresAt).toLocaleDateString()}
                </small>
              </div>
              {session.current ? (
                <span className="status-badge done">Current</span>
              ) : (
                <button
                  className="secondary-button"
                  onClick={() => revoke.mutate(session.id)}
                  disabled={revoke.isPending}
                >
                  Sign out session
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {revoke.error && (
        <p className="inline-error" role="alert">
          {message(revoke.error)}
        </p>
      )}
    </section>
  );
}
