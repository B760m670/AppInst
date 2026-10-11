import { useState } from 'react';
import { formatRub } from '@appinst/shared';
import { api, ApiError, type AdminApp } from '../api';
import { useLoad } from '../hooks';
import { ErrorState, Loader, Section } from '../components/ui';

type View = 'apps' | 'orders' | 'payouts' | 'settings';

export function Admin() {
  const [view, setView] = useState<View>('apps');
  return (
    <div>
      <h1>Админка</h1>
      <div className="chips">
        {(
          [
            ['apps', 'Приложения'],
            ['orders', 'Заказы'],
            ['payouts', 'Выводы'],
            ['settings', 'Настройки'],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button key={key} className={view === key ? 'chip active' : 'chip'} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>
      {view === 'apps' && <AppsAdmin />}
      {view === 'orders' && <OrdersAdmin />}
      {view === 'payouts' && <PayoutsAdmin />}
      {view === 'settings' && <SettingsAdmin />}
    </div>
  );
}

const emptyApp: AdminApp = {
  id: '',
  name: '',
  category: 'Сервисы',
  icon_url: null,
  version: null,
  description: null,
  min_ios: '17.0',
  manifest_url: null,
  extra_instructions: [],
  popular: false,
  active: true,
  sort: 0,
};

function AppsAdmin() {
  const apps = useLoad(() => api.admin.apps());
  const [editing, setEditing] = useState<AdminApp | null>(null);
  if (editing) return <AppForm app={editing} onDone={() => { setEditing(null); void apps.reload(); }} />;
  if (apps.loading && !apps.data) return <Loader />;
  if (apps.error) return <ErrorState text={apps.error} onRetry={apps.reload} />;
  return (
    <>
      <button className="btn" onClick={() => setEditing({ ...emptyApp })}>
        Добавить приложение
      </button>
      <ul className="list">
        {apps.data!.map((a) => (
          <li key={a.id}>
            <button className="row" onClick={() => setEditing(a)}>
              <div className="row-text">
                <b>{a.name}</b>
                <span className="muted">
                  {a.id} · {a.category} · {a.active ? 'активно' : 'скрыто'}
                  {!a.manifest_url && ' · нет manifest'}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function AppForm({ app, onDone }: { app: AdminApp; onDone: () => void }) {
  const [form, setForm] = useState(app);
  const [extra, setExtra] = useState(JSON.stringify(app.extra_instructions, null, 2));
  const [error, setError] = useState<string | null>(null);
  const isNew = !app.id;
  const set = <K extends keyof AdminApp>(k: K, v: AdminApp[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: 'id' | 'name' | 'category' | 'icon_url' | 'version' | 'description' | 'min_ios' | 'manifest_url', label: string) => (
    <label className="field">
      <span>{label}</span>
      <input
        value={form[k] ?? ''}
        disabled={k === 'id' && !isNew}
        onChange={(e) => set(k, e.target.value === '' && k !== 'id' && k !== 'name' && k !== 'category' ? null : e.target.value)}
      />
    </label>
  );

  const save = async () => {
    try {
      const extra_instructions = JSON.parse(extra || '[]');
      await api.admin.saveApp({ ...form, extra_instructions });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof SyntaxError ? 'Доп. инструкции: некорректный JSON' : 'Ошибка сохранения');
    }
  };

  return (
    <Section title={isNew ? 'Новое приложение' : form.name}>
      {text('id', 'ID (латиница, цифры, - _)')}
      {text('name', 'Название')}
      {text('category', 'Категория')}
      {text('icon_url', 'URL иконки')}
      {text('version', 'Версия')}
      {text('min_ios', 'Мин. iOS')}
      {text('manifest_url', 'URL manifest.plist (https)')}
      {text('description', 'Описание')}
      <label className="field">
        <span>Порядок</span>
        <input type="number" value={form.sort} onChange={(e) => set('sort', Number(e.target.value))} />
      </label>
      <label className="toggle">
        <input type="checkbox" checked={form.popular} onChange={(e) => set('popular', e.target.checked)} /> Популярное
      </label>
      <label className="toggle">
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Показывать в каталоге
      </label>
      <label className="field">
        <span>Доп. инструкции (JSON: [{'{'}"title","steps":[],"link"{'}'}])</span>
        <textarea rows={5} value={extra} onChange={(e) => setExtra(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="btn secondary" onClick={onDone}>Отмена</button>
        <button className="btn" onClick={save}>Сохранить</button>
      </div>
    </Section>
  );
}

function OrdersAdmin() {
  const orders = useLoad(() => api.admin.orders());
  if (orders.loading && !orders.data) return <Loader />;
  if (orders.error) return <ErrorState text={orders.error} onRetry={orders.reload} />;
  return (
    <ul className="plain">
      {orders.data!.map((o) => (
        <li key={o.id} className="card">
          <div className="kv">
            <b>№{o.id} · {o.status === 'paid' ? 'оплачен' : o.status === 'pending' ? 'ожидает' : 'отменён'}</b>
            <b>{formatRub(o.amount_minor)}</b>
          </div>
          <p className="muted small">
            {o.username ? `@${o.username}` : o.user_id} · {new Date(o.created_at).toLocaleString('ru-RU')}
          </p>
          <p className="small">{o.apps.join(', ')}</p>
        </li>
      ))}
    </ul>
  );
}

function PayoutsAdmin() {
  const payouts = useLoad(() => api.admin.payouts());
  const act = async (id: number, action: 'complete' | 'reject') => {
    await api.admin.payoutAction(id, action);
    void payouts.reload();
  };
  if (payouts.loading && !payouts.data) return <Loader />;
  if (payouts.error) return <ErrorState text={payouts.error} onRetry={payouts.reload} />;
  if (payouts.data!.length === 0) return <p className="muted">Заявок нет.</p>;
  return (
    <ul className="plain">
      {payouts.data!.map((p) => (
        <li key={p.id} className="card">
          <div className="kv">
            <b>№{p.id} · {p.username ? `@${p.username}` : p.user_id}</b>
            <b>{formatRub(p.amount_minor)}</b>
          </div>
          <p className="small">{p.details}</p>
          {p.status === 'requested' ? (
            <div className="actions">
              <button className="btn secondary" onClick={() => act(p.id, 'reject')}>Отклонить</button>
              <button className="btn" onClick={() => act(p.id, 'complete')}>Выплачено</button>
            </div>
          ) : (
            <p className="muted small">{p.status === 'completed' ? 'Выплачено' : 'Отклонено'}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function SettingsAdmin() {
  const settings = useLoad(() => api.admin.settings());
  const [message, setMessage] = useState<string | null>(null);
  if (settings.loading && !settings.data) return <Loader />;
  if (settings.error || !settings.data) return <ErrorState text={settings.error ?? ''} onRetry={settings.reload} />;
  const s = settings.data;
  const promo = s.promotion ?? { id: 'promo', title: '5 любых приложений', requiredCount: 5, priceMinor: 199_000, active: false };

  const save = async (patch: Parameters<typeof api.admin.saveSettings>[0]) => {
    try {
      await api.admin.saveSettings(patch);
      setMessage('Сохранено');
      void settings.reload();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Ошибка сохранения');
    }
  };

  const rub = (minor: number) => minor / 100;
  const num = (form: FormData, key: string) => Number(form.get(key));

  return (
    <>
      <Section title="Продажи">
        <label className="toggle">
          <input type="checkbox" checked={s.installationsPaused} onChange={(e) => save({ installationsPaused: e.target.checked })} />
          Технические работы (пауза заказов и установок)
        </label>
      </Section>
      <Section title="Цены">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              pricing: {
                ...s.pricing,
                baseUnitPriceMinor: num(f, 'base') * 100,
                positionPriceStepMinor: num(f, 'step') * 100,
                minimumUnitPriceMinor: num(f, 'min') * 100,
                markupPercent: num(f, 'markup'),
              },
            });
          }}
        >
          <label className="field"><span>Цена 1-го приложения, ₽ (до наценки)</span><input name="base" type="number" defaultValue={rub(s.pricing.baseUnitPriceMinor)} /></label>
          <label className="field"><span>Шаг скидки за позицию, ₽</span><input name="step" type="number" defaultValue={rub(s.pricing.positionPriceStepMinor)} /></label>
          <label className="field"><span>Минимальная цена, ₽</span><input name="min" type="number" defaultValue={rub(s.pricing.minimumUnitPriceMinor)} /></label>
          <label className="field"><span>Наценка, %</span><input name="markup" type="number" defaultValue={s.pricing.markupPercent} /></label>
          <button className="btn">Сохранить цены</button>
        </form>
      </Section>
      <Section title="Акция «N приложений за X ₽»">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              promotion: {
                id: promo.id,
                title: String(f.get('title')),
                requiredCount: num(f, 'count'),
                priceMinor: num(f, 'price') * 100,
                active: f.get('active') === 'on',
              },
            });
          }}
        >
          <label className="field"><span>Заголовок</span><input name="title" defaultValue={promo.title} /></label>
          <label className="field"><span>Количество приложений</span><input name="count" type="number" defaultValue={promo.requiredCount} /></label>
          <label className="field"><span>Цена, ₽</span><input name="price" type="number" defaultValue={rub(promo.priceMinor)} /></label>
          <label className="toggle"><input name="active" type="checkbox" defaultChecked={promo.active} /> Акция включена</label>
          <button className="btn">Сохранить акцию</button>
        </form>
      </Section>
      {message && <p className="muted">{message}</p>}
    </>
  );
}
