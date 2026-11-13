import { existsSync, readFileSync } from 'node:fs';
export const GRAPH_LOCK = '.graph-update.lock';
export function assertGraphReadable() {
  if (!existsSync(GRAPH_LOCK)) return;
  let token: string | undefined;
  try { token = JSON.parse(readFileSync(`${GRAPH_LOCK}/owner.json`, 'utf8')).token; } catch { /* Interrupted acquisition is also locked. */ }
  if (!token || token !== process.env.GRAPH_UPDATE_LOCK_TOKEN) throw new Error('Graph update/build is locked. Wait for its completion, or inspect and run graph:update -- --recover after an interrupted process.');
}
