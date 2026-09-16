import { useEffect, useState } from 'react';
import type { Replay } from '../models';

export default function App() {
  const [replay, setReplay] = useState<Replay | null>(null);
  useEffect(() => { fetch('/replay.json').then((response) => response.ok ? response.json() : null).then((data: Replay | null) => setReplay(data)).catch(() => setReplay(null)); }, []);
  return <main><h1>Campus Crisis Agent</h1><p>Phase 1 prediction engine foundation.</p>{replay ? <p>{replay.decisions.length} reports replay-ready across {replay.incidents.length} incidents.</p> : <p>Run <code>npm run predict</code> to generate the replay data.</p>}</main>;
}
