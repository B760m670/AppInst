import { useState } from 'react';
import { api, ApiError } from '../api';
import { formatLeft, useLoad, useNow } from '../hooks';
import { haptic, openExternal } from '../telegram';
import { AppIcon, ErrorState, Header, Loader, Section } from '../components/ui';
import { STATUS_LABEL } from './Purchases';

const ACTIVATION_STEPS = [
  'Откройте «Настройки» и нажмите на свой профиль вверху.',
  'Откройте «Контент и покупки» и нажмите «Выйти». iCloud при этом не меняется.',
  'Снова откройте «Контент и покупки» и выберите вход в другой аккаунт («Не <имя>?»).',
  'Введите данные для входа, которые выдаст поддержка, и код подтверждения.',
  'Откройте установленное приложение один раз.',
  'Вернитесь в «Контент и покупки», выйдите и войдите в свой аккаунт.',
];

interface Props {
  id: number;
  supportUrl: string | null;
  onBack: () => void;
}

export function PurchaseScreen({ id, supportUrl, onBack }: Props) {
  const purchase = useLoad(() => api.purchase(id), [id]);
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось выполнить действие.');
      haptic('error');
    } finally {
      setBusy(false);
    }
  };

  if (purchase.loading && !purchase.data) return <Loader />;
  if (purchase.error || !purchase.data) return <ErrorState text={purchase.error ?? 'Покупка не найдена.'} onRetry={purchase.reload} />;
  const p = purchase.data;
  const left = p.installExpiresAt ? Date.parse(p.installExpiresAt) - now : 0;

  const startInstall = () =>
    run(async () => {
      const updated = await api.startInstall(p.id);
      purchase.setData(updated);
      if (updated.installUrl) openExternal(updated.installUrl);
    });

  return (
    <div className="screen">
      <Header title={p.appName} onBack={onBack} />
      <div className="hero">
        <AppIcon url={p.appIconUrl} name={p.appName} size={72} />
        <div>
          <h2>{p.appName}</h2>
          <span className={`badge ${p.status}`}>{STATUS_LABEL[p.status]}</span>
          {p.appVersion && <p className="muted small">Версия {p.appVersion}</p>}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {p.status === 'available' && (
        <Section title="1. Установка">
          <p className="muted">
            После старта ссылка на установку действует 12 часов. Начните, когда будете готовы.
          </p>
          <button className="btn" disabled={busy} onClick={startInstall}>
            Начать установку
          </button>
        </Section>
      )}

      {p.status === 'installing' && (
        <>
          <Section title="1. Установка">
            <p className="muted">Осталось {formatLeft(left)}. Ссылка откроется в Safari — нажмите «Установить» и дождитесь иконки на экране.</p>
            <button className="btn" disabled={!p.installUrl} onClick={() => p.installUrl && openExternal(p.installUrl)}>
              Установить приложение
            </button>
            <details>
              <summary>Не начинается загрузка?</summary>
              <p className="muted small">
                Отключите Wi‑Fi и попробуйте через мобильный интернет. Если не помогло — перезагрузите iPhone.
              </p>
            </details>
          </Section>
          <Section title="2. Активация">
            <p className="muted small">Переходите к активации, только когда приложение полностью скачалось.</p>
            <ol className="steps">
              {ACTIVATION_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {supportUrl && (
              <button className="btn secondary" onClick={() => openExternal(supportUrl)}>
                Получить данные для входа
              </button>
            )}
          </Section>
          {p.extraInstructions.map((ex) => (
            <Section key={ex.title} title={`После первого запуска: ${ex.title}`}>
              <ol className="steps">
                {ex.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {ex.link && (
                <button className="btn secondary" onClick={() => openExternal(ex.link!)}>
                  Открыть
                </button>
              )}
            </Section>
          ))}
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                purchase.setData(await api.markInstalled(p.id));
                haptic('success');
              })
            }
          >
            Приложение установлено и открывается
          </button>
        </>
      )}

      {p.status === 'installed' && (
        <Section>
          <p>Готово! Приложение установлено. Не удаляйте его — повторная установка делается через поддержку.</p>
        </Section>
      )}

      {(p.status === 'expired' || p.status === 'refunded') && (
        <Section>
          <p>
            {p.status === 'expired'
              ? 'Время на установку истекло. Напишите в поддержку и укажите номер покупки — мы откроем установку заново.'
              : 'По этой покупке оформлен возврат.'}
          </p>
          <p className="muted small">Покупка №{p.id}</p>
        </Section>
      )}

      {supportUrl && p.status !== 'installing' && (
        <button className="btn link" onClick={() => openExternal(supportUrl)}>
          Написать в поддержку
        </button>
      )}
    </div>
  );
}
