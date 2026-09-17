import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Profile } from './data/types';
import { loadProfiles } from './data/profileSource';
import { Scene } from './scene/Scene';
import { Toolbar } from './ui/Toolbar';
import { Legend } from './ui/Legend';
import { ProfilePanel } from './ui/ProfilePanel';

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [month, setMonth] = useState<number | 'all'>('all');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    let cancelled = false;
    loadProfiles()
      .then((data) => {
        if (cancelled) return;
        setProfiles(data);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => (month === 'all' ? profiles : profiles.filter((p) => p.month === month)),
    [profiles, month],
  );

  useEffect(() => {
    if (selected && !visible.some((p) => p.id === selected.id)) setSelected(null);
  }, [visible, selected]);

  return (
    <div className="app">
      <Toolbar
        month={month}
        onMonthChange={setMonth}
        visibleCount={visible.length}
        totalCount={profiles.length}
        onResetView={() => controls.current?.reset()}
      />

      <main className="viewport">
        {status === 'ready' ? (
          <Scene
            ref={controls}
            profiles={visible}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onClearSelection={() => setSelected(null)}
          />
        ) : (
          <p className="state">
            {status === 'loading' ? 'Loading profiles…' : 'Profiles failed to load. Reload to retry.'}
          </p>
        )}

        <p className="hint">Drag to rotate · right-drag to pan · scroll to zoom · click a float</p>
        <Legend />
        <ProfilePanel profile={selected} onClose={() => setSelected(null)} />
      </main>
    </div>
  );
}
