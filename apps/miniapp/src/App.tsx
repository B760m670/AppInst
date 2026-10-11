import { useEffect, useState } from 'react';
import type { OrderDto } from '@appinst/shared';
import { api } from './api';
import { useLoad } from './hooks';
import { tg } from './telegram';
import { Catalog } from './screens/Catalog';
import { Checkout } from './screens/Checkout';
import { Purchases } from './screens/Purchases';
import { PurchaseScreen } from './screens/PurchaseScreen';
import { Referrals } from './screens/Referrals';
import { Admin } from './screens/Admin';

type Tab = 'catalog' | 'purchases' | 'referrals' | 'admin';
type Overlay = { kind: 'checkout'; order: OrderDto; paymentUrl: string } | { kind: 'purchase'; id: number } | null;

export function App() {
  const [tab, setTab] = useState<Tab>('catalog');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const settings = useLoad(() => api.publicSettings());
  const profile = useLoad(() => api.profile());

  // Telegram's native back button closes the current overlay.
  useEffect(() => {
    const back = tg()?.BackButton;
    if (!back) return;
    const close = () => setOverlay(null);
    if (overlay) {
      back.show();
      back.onClick(close);
    } else back.hide();
    return () => back.offClick(close);
  }, [overlay]);

  const support = settings.data?.supportUrl ?? null;

  if (overlay?.kind === 'checkout') {
    return (
      <Checkout
        initial={overlay.order}
        paymentUrl={overlay.paymentUrl}
        onBack={() => setOverlay(null)}
        onPaid={() => {
          void profile.reload();
          setOverlay(null);
          setTab('purchases');
        }}
        supportUrl={support}
      />
    );
  }
  if (overlay?.kind === 'purchase') {
    return (
      <PurchaseScreen
        id={overlay.id}
        supportUrl={support}
        onBack={() => {
          void profile.reload();
          setOverlay(null);
        }}
      />
    );
  }

  const tabs: [Tab, string][] = [
    ['catalog', 'Каталог'],
    ['purchases', 'Покупки'],
    ['referrals', 'Друзья'],
  ];
  if (profile.data?.user.isAdmin) tabs.push(['admin', 'Админ']);

  return (
    <div className="layout">
      {settings.data?.installationsPaused && (
        <div className="banner warn">Технические работы: оформление заказов временно приостановлено.</div>
      )}
      <main>
        {tab === 'catalog' && (
          <Catalog onOrderCreated={(order, paymentUrl) => setOverlay({ kind: 'checkout', order, paymentUrl })} />
        )}
        {tab === 'purchases' && (
          <Purchases
            profile={profile}
            onOpen={(id) => setOverlay({ kind: 'purchase', id })}
            onCatalog={() => setTab('catalog')}
          />
        )}
        {tab === 'referrals' && <Referrals />}
        {tab === 'admin' && <Admin />}
      </main>
      <nav className="tabbar">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
