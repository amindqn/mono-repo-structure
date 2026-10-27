'use client';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@repo/api-client';
import { MAX_UPLOAD_BYTES, MEDIA_TYPES } from '@repo/contracts';
import type { MediaDto, StorageKind } from '@repo/contracts';
import { apiClient } from '@/lib/api-client';
import { WorkspaceShell } from '@/components/workspace-shell';
import { Icon } from '@/components/icon';
import { useMedia } from '../api/use-media';

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Unable to complete the request. Please try again.';
export function MediaWorkspace() {
  const { assets, config, upload, remove, health } = useMedia();
  const [file, setFile] = useState<File | null>(null);
  const [storage, setStorage] = useState<StorageKind>('database');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setFeedback('');
    if (!file || !file.size || file.size > MAX_UPLOAD_BYTES) {
      setError('Choose a nonempty JPEG, PNG, WebP, or PDF up to 5 MiB.');
      return;
    }
    try {
      await upload.mutateAsync({ file, storage });
      setFile(null);
      if (input.current) input.current.value = '';
      setFeedback('Your file is uploaded.');
    } catch (error) {
      setError(message(error));
    }
  }
  async function download(asset: MediaDto) {
    setError('');
    try {
      const blob = await apiClient.downloadMedia(asset.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = asset.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(message(error));
    }
  }
  return (
    <WorkspaceShell section="media">
      <section className="page-intro">
        <div>
          <p className="eyebrow">A HOME FOR YOUR FILES</p>
          <h1>
            Your media library<span>.</span>
          </h1>
          <p className="intro-copy">Keep the files you need close, and your workspace organized.</p>
        </div>
        <Icon name="files" size={44} />
      </section>
      <section className="settings-card" aria-labelledby="upload-title">
        <h2 id="upload-title">Add a file</h2>
        <p className="section-description">
          JPEG, PNG, WebP, or PDF · Up to 5 MiB per file · 100 files / 100 MiB per account
        </p>
        <form
          className="media-upload-form settings-form"
          onSubmit={(event) => {
            void submit(event);
          }}
          aria-busy={upload.isPending}
        >
          <label>
            Choose a file
            <input
              ref={input}
              type="file"
              accept={MEDIA_TYPES.join(',')}
              required
              disabled={upload.isPending}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError('');
                setFeedback('');
              }}
            />
          </label>
          <label>
            Storage location
            <select
              value={storage}
              disabled={upload.isPending || !config.data}
              onChange={(event) => setStorage(event.target.value as StorageKind)}
            >
              <option value="database">Database storage</option>
              <option value="object" disabled={!config.data?.providers.includes('object')}>
                Object storage (S3 compatible)
              </option>
            </select>
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={!file || upload.isPending || !config.data}
          >
            {upload.isPending ? 'Uploading…' : 'Upload file'}
            <Icon name="plus" size={17} />
          </button>
        </form>
        {config.isError && (
          <p className="inline-error" role="alert">
            {message(config.error)}
          </p>
        )}
        {config.isSuccess && !config.data.providers.includes('object') && (
          <p className="section-description">
            Object storage is not configured for this workspace. Database storage is available.
          </p>
        )}
        {health.data?.persistence === 'memory' && (
          <p className="demo-notice">
            Demo storage: files and accounts reset when the API restarts.
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {feedback && (
          <p className="form-notice" role="status">
            {feedback}
          </p>
        )}
      </section>
      <section className="media-library" aria-labelledby="library-title">
        <div className="library-heading">
          <h2 id="library-title">
            Your files <span>{assets.data?.items.length ?? 0}</span>
          </h2>
          <small>Private to your account</small>
        </div>
        {assets.isPending ? (
          <p role="status">Loading files…</p>
        ) : assets.isError ? (
          <div role="alert">
            <p>{message(assets.error)}</p>
            <button
              className="secondary-button"
              onClick={() => {
                void assets.refetch();
              }}
            >
              Try again
            </button>
          </div>
        ) : !assets.data.items.length ? (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="files" size={30} />
            </span>
            <h3>A little space for your essentials.</h3>
            <p>Upload your first file above.</p>
          </div>
        ) : (
          <ul className="media-grid">
            {assets.data.items.map((asset) => (
              <li className="media-card" key={asset.id}>
                <div className="media-preview">
                  {asset.contentType.startsWith('image/') ? (
                    <img
                      src={`/api/v1/media/${asset.id}/content`}
                      alt={asset.filename}
                      loading="lazy"
                    />
                  ) : (
                    <Icon name="files" size={42} />
                  )}
                </div>
                <div className="media-details">
                  <strong title={asset.filename}>{asset.filename}</strong>
                  <small>
                    {(asset.size / 1024).toFixed(1)} KiB ·{' '}
                    {asset.storage === 'database' ? 'Database' : 'Object storage'}
                  </small>
                  <div className="media-actions">
                    <button
                      className="secondary-button"
                      onClick={() => {
                        void download(asset);
                      }}
                      aria-label={`Download ${asset.filename}`}
                    >
                      Download
                    </button>
                    <button
                      className="text-button danger"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete ${asset.filename}?`)) remove.mutate(asset.id);
                      }}
                      aria-label={`Delete ${asset.filename}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {remove.error && (
          <p className="inline-error" role="alert">
            {message(remove.error)}
          </p>
        )}
      </section>
    </WorkspaceShell>
  );
}
