interface WebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string }; start_param?: string };
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  showAlert(message: string): void;
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium'): void; notificationOccurred(t: 'success' | 'error'): void };
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

export const tg = (): WebApp | undefined => window.Telegram?.WebApp;

export function openExternal(url: string) {
  const app = tg();
  if (app?.initData) app.openLink(url, { try_instant_view: false });
  else window.open(url, '_blank', 'noopener');
}

export function share(url: string, text: string) {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const app = tg();
  if (app?.initData) app.openTelegramLink(link);
  else window.open(link, '_blank', 'noopener');
}

export const haptic = (kind: 'light' | 'success' | 'error' = 'light') => {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  if (kind === 'light') h.impactOccurred('light');
  else h.notificationOccurred(kind);
};
