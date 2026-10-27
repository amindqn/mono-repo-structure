'use client';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="fallback">
      <h1>Something interrupted your workspace.</h1>
      <p>Please try loading it again.</p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
