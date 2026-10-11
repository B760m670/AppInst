import { useMemo, useState } from 'react';
import { formatRub, quote, type OrderDto } from '@appinst/shared';
import { api, ApiError } from '../api';
import { useLoad } from '../hooks';
import { haptic } from '../telegram';
import { AppIcon, ErrorState, Loader } from '../components/ui';

const ALL = 'Все';

export function Catalog({ onOrderCreated }: { onOrderCreated: (order: OrderDto, paymentUrl: string) => void }) {
  const apps = useLoad(() => api.apps());
  const pricing = useLoad(() => api.pricing());
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(
    () => [ALL, ...new Set((apps.data ?? []).map((a) => a.category))],
    [apps.data],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (apps.data ?? []).filter(
      (a) => (category === ALL || a.category === category) && (!q || a.name.toLowerCase().includes(q)),
    );
  }, [apps.data, query, category]);
  const popular = (apps.data ?? []).filter((a) => a.popular && a.available);

  const q = pricing.data ? quote(selected.length, pricing.data.pricing, pricing.data.promotion) : null;
  const promo = pricing.data?.promotion;

  const toggle = (id: string) => {
    haptic();
    setError(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const checkout = async () => {
    if (!q || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { order, paymentUrl } = await api.createOrder(selected, q.totalMinor);
      onOrderCreated(order, paymentUrl);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'price_changed') void pricing.reload();
      if (err instanceof ApiError && err.code === 'app_unavailable') void apps.reload();
      setError(err instanceof ApiError ? err.message : 'Не удалось создать заказ.');
      haptic('error');
    } finally {
      setBusy(false);
    }
  };

  if (apps.loading && !apps.data) return <Loader text="Загружаем каталог" />;
  if (apps.error) return <ErrorState text={apps.error} onRetry={apps.reload} />;

  return (
    <div className="catalog">
      <h1>Приложения для iPhone</h1>
      {promo && (
        <div className="promo">
          <b>{promo.title}</b>
          <span>Выберите ровно {promo.requiredCount} приложений — {formatRub(promo.priceMinor)}</span>
        </div>
      )}
      <input
        className="search"
        placeholder="Найти приложение"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chips">
        {categories.map((c) => (
          <button key={c} className={c === category ? 'chip active' : 'chip'} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      {!query && category === ALL && popular.length > 0 && (
        <div className="popular">
          {popular.map((a) => (
            <button key={a.id} className={selected.includes(a.id) ? 'tile selected' : 'tile'} onClick={() => toggle(a.id)}>
              <AppIcon url={a.iconUrl} name={a.name} size={56} />
              <span>{a.name}</span>
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="muted center">Ничего не найдено. Попробуйте другой запрос или категорию.</p>
      ) : (
        <ul className="list">
          {visible.map((a) => {
            const isSelected = selected.includes(a.id);
            return (
              <li key={a.id}>
                <button className="row" disabled={!a.available} onClick={() => toggle(a.id)}>
                  <AppIcon url={a.iconUrl} name={a.name} />
                  <div className="row-text">
                    <b>{a.name}</b>
                    <span className="muted">
                      {a.available ? [a.category, a.version && `v${a.version}`, a.minIos && `iOS ${a.minIos}+`].filter(Boolean).join(' · ') : 'Временно недоступно'}
                    </span>
                  </div>
                  <span className={isSelected ? 'check on' : 'check'}>{isSelected ? '✓' : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && q && (
        <div className="bottom-bar">
          {error && <p className="error">{error}</p>}
          <div className="sum">
            <span>
              Выбрано: {selected.length}
              {q.discountPercent > 0 && <em> · скидка {q.discountPercent}%</em>}
            </span>
            <span>
              {q.discountPercent > 0 && <s className="muted">{formatRub(q.originalTotalMinor)}</s>} <b>{formatRub(q.totalMinor)}</b>
            </span>
          </div>
          <div className="actions">
            <button className="btn secondary" onClick={() => setSelected([])}>
              Очистить
            </button>
            <button className="btn" disabled={busy} onClick={checkout}>
              {busy ? 'Создаём заказ…' : 'Продолжить'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
