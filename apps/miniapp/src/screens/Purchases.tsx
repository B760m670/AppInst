import type { ProfileDto, PurchaseStatus } from '@appinst/shared';
import { useNow, formatLeft } from '../hooks';
import { AppIcon, ErrorState, Loader } from '../components/ui';

export const STATUS_LABEL: Record<PurchaseStatus, string> = {
  available: 'Доступно',
  installing: 'Установка',
  installed: 'Установлено',
  expired: 'Срок истёк',
  refunded: 'Возврат',
};

interface Props {
  profile: { data: ProfileDto | null; error: string | null; loading: boolean; reload: () => Promise<void> };
  onOpen: (id: number) => void;
  onCatalog: () => void;
}

export function Purchases({ profile, onOpen, onCatalog }: Props) {
  const now = useNow(30_000);
  if (profile.loading && !profile.data) return <Loader text="Загружаем покупки" />;
  if (profile.error) return <ErrorState text={profile.error} onRetry={profile.reload} />;
  const purchases = profile.data?.purchases ?? [];

  if (purchases.length === 0) {
    return (
      <div className="state">
        <h2>Пока пусто</h2>
        <p className="muted">Здесь появятся оплаченные приложения.</p>
        <button className="btn" onClick={onCatalog}>
          Выбрать приложения
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Мои покупки</h1>
      <p className="muted">Установка каждого приложения запускается отдельно.</p>
      <ul className="list">
        {purchases.map((p) => (
          <li key={p.id}>
            <button className="row" onClick={() => onOpen(p.id)}>
              <AppIcon url={p.appIconUrl} name={p.appName} />
              <div className="row-text">
                <b>{p.appName}</b>
                <span className="muted">
                  {p.appVersion ? `Версия ${p.appVersion} · ` : ''}Заказ №{p.orderId}
                </span>
              </div>
              <span className={`badge ${p.status}`}>
                {p.status === 'installing' && p.installExpiresAt
                  ? formatLeft(Date.parse(p.installExpiresAt) - now)
                  : STATUS_LABEL[p.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
