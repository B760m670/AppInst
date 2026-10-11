import { useState, type ReactNode } from 'react';

export function AppIcon({ url, name, size = 52 }: { url: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  return url && !broken ? (
    <img className="app-icon" src={url} alt="" style={{ width: size, height: size }} onError={() => setBroken(true)} />
  ) : (
    <div className="app-icon placeholder" style={{ width: size, height: size }}>
      {name.slice(0, 1)}
    </div>
  );
}

export function Loader({ text = 'Загружаем…' }: { text?: string }) {
  return (
    <div className="state">
      <div className="spinner" />
      <p>{text}</p>
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <p>{text}</p>
      {onRetry && (
        <button className="btn secondary" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="section">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

export function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="header">
      {onBack && (
        <button className="back" onClick={onBack} aria-label="Назад">
          ‹
        </button>
      )}
      <h2>{title}</h2>
    </header>
  );
}
