import { createDb } from './db';
import { migrate } from './migrate';
import { saveApp } from './services/apps';

/**
 * Demo catalog. manifest_url is left empty: an app becomes purchasable only after the
 * operator sets the https URL of its OTA manifest.plist in the admin panel.
 */
const demo = [
  ['bank-1', 'Банк Онлайн', 'Банки', true],
  ['bank-2', 'Мобильный банк', 'Банки', true],
  ['social-1', 'Соцсеть', 'Общение', true],
  ['market-1', 'Объявления', 'Сервисы', false],
  ['ai-1', 'AI-ассистент', 'Сервисы', true],
  ['video-1', 'Видео', 'Развлечения', false],
] as const;

const bankSteps = [
  {
    title: 'Сертификаты Минцифры',
    steps: ['Откройте «Госуслуги».', 'В поиске введите «Установить сертификат от Минцифры».', 'Следуйте инструкции.'],
  },
];

const db = createDb(process.env.DATABASE_URL ?? '');
await migrate(db);
for (const [i, [id, name, category, popular]] of demo.entries()) {
  await saveApp(db, {
    id,
    name,
    category,
    popular,
    active: true,
    sort: i,
    icon_url: null,
    version: '1.0',
    description: null,
    min_ios: '17.0',
    manifest_url: null,
    extra_instructions: category === 'Банки' ? bankSteps : [],
  });
}
console.log(`Seeded ${demo.length} apps`);
await db.end();
