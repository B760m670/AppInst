import { useEffect, useState } from 'react';
import { formatRub, type OrderDto } from '@appinst/shared';
import { api, ApiError } from '../api';
import { haptic, openExternal } from '../telegram';
import { Header, Section } from '../components/ui';

interface Props {
  initial: OrderDto;
  paymentUrl: string;
  supportUrl: string | null;
  onBack: () => void;
  onPaid: () => void;
}

/** Opens the Freekassa page and polls the order until the payment notification arrives. */
export function Checkout({ initial, paymentUrl, supportUrl, onBack, onPaid }: Props) {
  const [order, setOrder] = useState(initial);
  const [opened, setOpened] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const check = async (manual: boolean) => {
    if (manual) setChecking(true);
    try {
      const res = await api.order(order.id);
      setOrder(res.order);
      if (res.order.status === 'paid') {
        haptic('success');
        onPaid();
      } else if (manual) setMessage('Платёж пока не подтверждён. Если вы уже оплатили, подождите минуту.');
    } catch (err) {
      if (manual) setMessage(err instanceof ApiError ? err.message : 'Не удалось проверить оплату.');
    } finally {
      if (manual) setChecking(false);
    }
  };

  useEffect(() => {
    if (!opened) return;
    const id = setInterval(() => void check(false), 4000);
    const onVisible = () => document.visibilityState === 'visible' && void check(false);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  return (
    <div className="screen">
      <Header title="Оформление заказа" onBack={onBack} />
      <Section>
        <div className="kv">
          <span>Заказ</span>
          <b>№{order.id}</b>
        </div>
        <div className="kv">
          <span>Приложений</span>
          <b>{order.appIds.length}</b>
        </div>
        <div className="kv total">
          <span>К оплате</span>
          <b>{formatRub(order.amountMinor)}</b>
        </div>
      </Section>
      <Section>
        <p className="muted">
          Оплата проходит на странице Freekassa (СБП или карта). После оплаты вернитесь в Telegram — приложения
          появятся в разделе «Покупки».
        </p>
        <p className="muted small">Оплачивая заказ, вы принимаете условия оферты.</p>
      </Section>
      {message && <p className="error">{message}</p>}
      <div className="stack">
        <button
          className="btn"
          onClick={() => {
            setOpened(true);
            setMessage(null);
            openExternal(paymentUrl);
          }}
        >
          {opened ? 'Открыть оплату ещё раз' : `Оплатить ${formatRub(order.amountMinor)}`}
        </button>
        {opened && (
          <button className="btn secondary" disabled={checking} onClick={() => void check(true)}>
            {checking ? 'Проверяем…' : 'Я оплатил — проверить'}
          </button>
        )}
        {supportUrl && (
          <button className="btn link" onClick={() => openExternal(supportUrl)}>
            Нужна помощь
          </button>
        )}
      </div>
    </div>
  );
}
