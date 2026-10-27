'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@repo/api-client';
import { createTaskSchema } from '@repo/contracts';
import { Icon } from '@/components/icon';
import { useTasks } from '../api/use-tasks';

type Filter = 'all' | 'open' | 'done';

function errorMessage(error: Error | null) {
  if (!error) return '';
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

export function TaskWorkspace() {
  const { tasks, health, create, update } = useTasks();
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [validationError, setValidationError] = useState('');
  const items = tasks.data?.items ?? [];
  const openCount = items.filter((task) => task.status === 'open').length;
  const doneCount = items.length - openCount;
  const visible = items.filter((task) => filter === 'all' || task.status === filter);
  const connected = health.isSuccess && !health.isError;
  const demo = health.data?.persistence === 'memory';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createTaskSchema.safeParse({ title });
    if (!result.success) {
      setValidationError('Enter a task between 1 and 120 characters.');
      return;
    }
    setValidationError('');
    try {
      await create.mutateAsync(result.data.title);
      setTitle('');
    } catch {
      /* The mutation error is rendered next to the form. */
    }
  }

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to tasks
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <a className="brand" href="/" aria-label="Forma home">
          <span className="brand-mark">
            <Icon name="layers" size={24} />
          </span>
          forma<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <a className="nav-item active" href="#main" aria-current="page">
          <Icon name="grid" />
          All tasks<span className="nav-count">{items.length}</span>
        </a>
        <div className="sidebar-note">
          <span className="note-icon">
            <Icon name="spark" />
          </span>
          <strong>Small steps. Real progress.</strong>
          <p>A little focus goes a long way. Make something good today.</p>
        </div>
        <div className="workspace-profile">
          <span className="avatar">Y</span>
          <div>
            <strong>Your workspace</strong>
            <small>A place to start</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <span>Overview</span>
          </div>
          <div className="connection" role="status">
            <span className={`connection-dot ${connected ? 'online' : ''}`} />
            {connected ? 'Connected' : health.isPending ? 'Connecting…' : 'API offline'}
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <section className="page-intro" aria-labelledby="page-title">
            <div>
              <p className="eyebrow">A LITTLE CLARITY, EVERY DAY</p>
              <h1 id="page-title">
                A clear space to build<span>.</span>
              </h1>
              <p className="intro-copy">Capture the next step. Find your focus. Keep moving.</p>
            </div>
            <span className="intro-symbol" aria-hidden="true">
              <Icon name="spark" size={52} />
            </span>
          </section>
          <section className="stats" aria-label="Task summary">
            <div className="stat">
              <span className="stat-label">
                Total tasks
                <Icon name="grid" size={17} />
              </span>
              <strong>{items.length.toString().padStart(2, '0')}</strong>
              <small>Your ideas, in one place</small>
            </div>
            <div className="stat">
              <span className="stat-label">
                In progress
                <Icon name="circle" size={17} />
              </span>
              <strong>{openCount.toString().padStart(2, '0')}</strong>
              <small>One step at a time</small>
            </div>
            <div className="stat">
              <span className="stat-label">
                Completed
                <Icon name="check" size={17} />
              </span>
              <strong>{doneCount.toString().padStart(2, '0')}</strong>
              <small>A little closer to the goal</small>
            </div>
          </section>
          <section className="task-panel" aria-labelledby="task-heading">
            <div className="panel-heading">
              <div>
                <h2 id="task-heading">
                  Your tasks <span>{items.length}</span>
                </h2>
                <p>Good things start with a simple next step.</p>
              </div>
              <span className="panel-kicker">LET’S MAKE PROGRESS</span>
            </div>
            <form
              onSubmit={(event) => {
                void submit(event);
              }}
              className="task-form"
              aria-busy={create.isPending}
            >
              <label htmlFor="task-title">What needs to get done?</label>
              <div className="input-row">
                <input
                  id="task-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setValidationError('');
                    create.reset();
                  }}
                  maxLength={120}
                  required
                  placeholder="e.g. Ship the first feature"
                  disabled={create.isPending}
                  aria-invalid={Boolean(validationError || create.error)}
                  aria-describedby="create-feedback"
                />
                <button className="primary-button" disabled={create.isPending} type="submit">
                  <Icon name="plus" size={18} />
                  {create.isPending ? 'Adding…' : 'Add task'}
                </button>
              </div>
              <div id="create-feedback" className="form-feedback" aria-live="polite">
                {validationError || errorMessage(create.error)}
              </div>
            </form>
            <div className="list-toolbar">
              <div className="filters" role="group" aria-label="Filter tasks">
                {(
                  [
                    ['all', 'All tasks'],
                    ['open', 'Open'],
                    ['done', 'Completed'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                    className={filter === value ? 'filter selected' : 'filter'}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="list-limit">100 most recent</span>
            </div>
            {tasks.isPending ? (
              <div className="empty-state" role="status">
                <p>Loading your workspace…</p>
              </div>
            ) : tasks.isError ? (
              <div className="empty-state" role="alert">
                <h3>We couldn’t load your tasks.</h3>
                <p>{errorMessage(tasks.error)}</p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    void tasks.refetch();
                  }}
                >
                  Try again
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">
                  <Icon name={filter === 'done' ? 'check' : 'layers'} size={30} />
                </span>
                <h3>
                  {filter === 'all'
                    ? 'A fresh start, full of possibility.'
                    : filter === 'done'
                      ? 'Your next win is waiting.'
                      : 'A little breathing room.'}
                </h3>
                <p>
                  {filter === 'all'
                    ? 'Add your first task above. Every great project starts somewhere.'
                    : filter === 'done'
                      ? 'Complete a task and celebrate a step forward.'
                      : 'No open tasks right now. You’re all caught up.'}
                </p>
              </div>
            ) : (
              <ul className="task-list" aria-label="Tasks">
                {visible.map((task) => (
                  <li
                    key={task.id}
                    className={`task-row ${task.status === 'done' ? 'completed' : ''}`}
                  >
                    <button
                      className="task-check"
                      aria-label={`${task.status === 'done' ? 'Reopen' : 'Complete'} ${task.title}`}
                      aria-pressed={task.status === 'done'}
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          id: task.id,
                          status: task.status === 'done' ? 'open' : 'done',
                        })
                      }
                    >
                      {task.status === 'done' && <Icon name="check" size={15} />}
                    </button>
                    <div className="task-text">
                      <strong>{task.title}</strong>
                      <small>
                        Added{' '}
                        <time dateTime={task.createdAt}>
                          {new Date(task.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </time>
                      </small>
                    </div>
                    <span className={`status-badge ${task.status}`}>
                      {task.status === 'done' ? 'Completed' : 'Open'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {update.error && (
              <p className="update-error" role="alert">
                {errorMessage(update.error)}
              </p>
            )}
            <footer className="panel-footer">
              <span>
                <span className="small-dot" />
                {demo
                  ? 'Demo session · tasks reset when the API restarts'
                  : connected
                    ? 'Saved to your workspace'
                    : 'Waiting for a connection'}
              </span>
              <span>
                Keep it simple. Keep going.
                <Icon name="arrow" size={15} />
              </span>
            </footer>
          </section>
          <footer className="page-footer">
            <span>Room for your next big thing.</span>
            <span className="footer-brand">forma.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
