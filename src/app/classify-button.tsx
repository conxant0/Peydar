'use client';

import { useRef, useState } from 'react';
import type { ClassifyOutcome } from '../lib/classification.ts';

type Props = { unfinished: number; action: (exclude: string[]) => Promise<ClassifyOutcome> };

export default function ClassifyButton({ unfinished, action }: Props) {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const stop = useRef(false);

  async function run() {
    stop.current = false;
    setRunning(true);
    const failed: string[] = [];
    let done = 0;
    let message = '';
    try {
      while (!stop.current) {
        setStatus(`Classifying… ${done} classified, ${failed.length} failed.`);
        const outcome = await action(failed);
        if (outcome.status === 'none') break;
        if (outcome.status === 'classified') done++;
        else {
          failed.push(outcome.paperId);
          message = outcome.error;
          if (outcome.unavailable) { message += ' Stopped; retry when the classifier is available.'; break; }
        }
      }
      setStatus(`${stop.current ? 'Stopped' : 'Finished'}: ${done} classified, ${failed.length} failed.${message ? ` Last error: ${message}` : ''}`);
    } catch (error) {
      setStatus(`Classification stopped: ${(error as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return <div className="actions">
    <button type="button" onClick={run} disabled={running || !unfinished}>
      {running ? 'Classifying…' : `Classify ${unfinished} unfinished ${unfinished === 1 ? 'paper' : 'papers'}`}</button>
    {running && <button type="button" className="secondary" onClick={() => { stop.current = true; }}>Stop after this paper</button>}
    <span className="muted" role="status">{status}</span>
  </div>;
}
