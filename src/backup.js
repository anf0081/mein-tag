import fs from 'node:fs';
import path from 'node:path';

/** Kopiert die Datendatei einmal pro Tag nach data/backups/ und behält die letzten `keep`. */
export function dailyBackup(dataFile, date, keep = 14, tag = '') {
  if (!fs.existsSync(dataFile)) return null;
  const dir = path.join(path.dirname(dataFile), 'backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = path.join(dir, `state-${date}${tag}.json`);
  if (!tag && fs.existsSync(target)) return null;
  fs.copyFileSync(dataFile, target); fs.chmodSync(target, 0o600);
  const files = fs.readdirSync(dir).filter((f) => /^state-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.unlinkSync(path.join(dir, f));
  return target;
}
