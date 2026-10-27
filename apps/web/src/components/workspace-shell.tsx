'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/session';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';
import { Icon } from './icon';

export function WorkspaceShell({
  children,
  section,
  taskCount,
}: {
  children: ReactNode;
  section: 'tasks' | 'media' | 'account';
  taskCount?: number;
}) {
  const { user, logout } = useSession();
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => apiClient.health(signal),
    refetchInterval: 30_000,
  });
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <Link className="brand" href="/" aria-label="Forma home">
          <span className="brand-mark">
            <Icon name="layers" size={24} />
          </span>
          forma<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation" className="workspace-nav">
          {(
            [
              ['tasks', '/', 'grid', 'Tasks'],
              ['media', '/media', 'files', 'Media library'],
              ['account', '/account', 'user', 'Account'],
            ] as const
          ).map(([key, href, icon, label]) => (
            <Link
              key={key}
              className={`nav-item ${section === key ? 'active' : ''}`}
              href={href}
              aria-current={section === key ? 'page' : undefined}
            >
              <Icon name={icon} />
              {label}
              {key === 'tasks' && taskCount !== undefined && (
                <span className="nav-count">{taskCount}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-icon">
            <Icon name="spark" />
          </span>
          <strong>Small steps. Real progress.</strong>
          <p>Your work and files stay in your personal workspace.</p>
        </div>
        <div className="workspace-profile">
          <span className="avatar">{user?.displayName.slice(0, 1).toUpperCase()}</span>
          <Link href="/account" className="profile-link">
            <strong>{user?.displayName}</strong>
            <small>Manage your account</small>
          </Link>
        </div>
        <button className="sign-out" disabled={logout.isPending} onClick={() => logout.mutate()}>
          {logout.isPending ? 'Signing out…' : 'Sign out'}
          <Icon name="logout" size={16} />
        </button>
        {logout.error && (
          <p className="inline-error" role="alert">
            Unable to sign out. Check your connection and try again.
          </p>
        )}
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <span>
              {section === 'tasks' ? 'Overview' : section === 'media' ? 'Media library' : 'Account'}
            </span>
          </div>
          <div className="connection" role="status">
            <span
              className={`connection-dot ${health.isSuccess && !health.isError ? 'online' : ''}`}
            />
            {health.isSuccess && !health.isError
              ? 'Connected'
              : health.isPending
                ? 'Connecting…'
                : 'API offline'}
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
