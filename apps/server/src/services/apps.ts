import type { AppDto, ExtraInstruction } from '@appinst/shared';
import type { Db, Tx } from '../db';

export interface AppRow {
  id: string;
  name: string;
  category: string;
  icon_url: string | null;
  version: string | null;
  description: string | null;
  min_ios: string | null;
  manifest_url: string | null;
  extra_instructions: ExtraInstruction[];
  popular: boolean;
  active: boolean;
  sort: number;
}

export const toAppDto = (r: AppRow): AppDto => ({
  id: r.id,
  name: r.name,
  category: r.category,
  iconUrl: r.icon_url,
  version: r.version,
  description: r.description,
  minIos: r.min_ios,
  popular: r.popular,
  available: r.active && !!r.manifest_url,
});

export async function listApps(db: Db | Tx, includeInactive = false): Promise<AppRow[]> {
  const { rows } = await db.query<AppRow>(
    `SELECT * FROM apps ${includeInactive ? '' : 'WHERE active'} ORDER BY sort, name`,
  );
  return rows;
}

export type AppInput = Omit<AppRow, 'sort'> & { sort?: number };

export async function saveApp(db: Db, app: AppInput): Promise<AppRow> {
  const { rows } = await db.query<AppRow>(
    `INSERT INTO apps(id, name, category, icon_url, version, description, min_ios, manifest_url,
                      extra_instructions, popular, active, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
       icon_url = EXCLUDED.icon_url, version = EXCLUDED.version, description = EXCLUDED.description,
       min_ios = EXCLUDED.min_ios, manifest_url = EXCLUDED.manifest_url,
       extra_instructions = EXCLUDED.extra_instructions, popular = EXCLUDED.popular,
       active = EXCLUDED.active, sort = EXCLUDED.sort
     RETURNING *`,
    [
      app.id, app.name, app.category, app.icon_url, app.version, app.description, app.min_ios,
      app.manifest_url, JSON.stringify(app.extra_instructions), app.popular, app.active, app.sort ?? 0,
    ],
  );
  return rows[0]!;
}
