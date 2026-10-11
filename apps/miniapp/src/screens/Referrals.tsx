import { useState } from 'react';
import { formatRub } from '@appinst/shared';
import { api, ApiError } from '../api';
import { useLoad } from '../hooks';
import { haptic, share } from '../telegram';
import { ErrorState, Loader, Section } from '../components/ui';

export function Referrals() {
  const refs = useLoad(() => api.referrals());
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (refs.loading && !refs.data) return <Loader />;
  if (refs.error || !refs.data) return <ErrorState text={refs.error ?? 'Не удалось загрузить'} onRetry={refs.reload} />;
  const r = refs.data;
  const canWithdraw = r.balanceMinor > 0 && r.balanceMinor >= r.minPayoutMinor;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.link);
      setCopied(true);
      haptic('success');
    } catch {
      setMessage(r.link);
    }
  };

  const withdraw = async () => {
    try {
      await api.requestPayout(details);
      setMessage('Заявка на вывод отправлена.');
      setDetails('');
      void refs.reload();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Не удалось отправить заявку.');
    }
  };

  return (
    <div>
      <h1>Пригласить друзей</h1>
      <p className="muted">Получайте {r.percent}% с каждой оплаты приглашённого пользователя.</p>
      <Section>
        <div className="link-box">{r.link}</div>
        <div className="actions">
          <button className="btn secondary" onClick={copy}>
            {copied ? 'Скопировано' : 'Скопировать'}
          </button>
          <button className="btn" onClick={() => share(r.link, 'Приложения для iPhone')}>
            Поделиться
          </button>
        </div>
      </Section>
      <div className="stats">
        <div><b>{r.invited}</b><span>Приглашено</span></div>
        <div><b>{r.paid}</b><span>Оплатили</span></div>
        <div><b>{formatRub(r.balanceMinor)}</b><span>Баланс</span></div>
      </div>
      <Section title="Вывод">
        <p className="muted small">Вывод доступен от {formatRub(r.minPayoutMinor)}.</p>
        <input
          className="search"
          placeholder="Реквизиты: телефон СБП и банк"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        <button className="btn" disabled={!canWithdraw || details.trim().length < 3} onClick={withdraw}>
          Запросить вывод
        </button>
        {message && <p className="muted">{message}</p>}
      </Section>
      {r.transactions.length > 0 && (
        <Section title="Операции">
          <ul className="plain">
            {r.transactions.map((t) => (
              <li key={t.id} className="kv">
                <span>
                  {t.kind === 'accrual' ? 'Начисление' : 'Вывод'} · {new Date(t.createdAt).toLocaleDateString('ru-RU')}
                </span>
                <b>{formatRub(t.amountMinor)}</b>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
