import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="fallback">
      <h1>This page isn’t here.</h1>
      <p>Your workspace is just one step away.</p>
      <Link href="/">Back to tasks</Link>
    </main>
  );
}
