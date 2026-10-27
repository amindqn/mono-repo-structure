import type { ReactNode } from 'react';
import { Icon } from '@/components/icon';
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/" aria-label="Forma home">
          <Icon name="layers" size={28} />
          forma<span className="brand-dot">.</span>
        </a>
        <div>
          <p className="eyebrow">YOUR IDEAS. YOUR SPACE.</p>
          <h1>
            A little focus.
            <br />A lot of possibility<span>.</span>
          </h1>
          <p>Keep your work, files, and next great idea together in a space that’s yours.</p>
        </div>
        <small>Make something good today.</small>
      </section>
      {children}
    </main>
  );
}
