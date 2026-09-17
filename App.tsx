import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Profile } from './data/types';
import { loadProfiles } from './data/profileSource';
import { isWebGLAvailable } from './lib/webgl';
import { Scene } from './scene/Scene';
import { Toolbar } from './ui/Toolbar';
import { Legend } from './ui/Legend';
import { ProfilePanel } from './ui/ProfilePanel';
import { StatusScreen } from './ui/StatusScreen';

type Status = 'loading' | 'ready' | 'error';

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [month, setMonth] = useState<number | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const webgl = useMemo(isWebGLAvailable, []);

  const fetchProfiles = useCallback(() => {
    setStatus('loading');
    loadProfiles()
      .then((data) => {
        setProfiles(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(fetchProfiles, [fetchProfiles]);

  const visible = useMemo(
    () => (month === 'all' ? profiles : profiles.filter((p) => p.month === month)),
    [profiles, month],
  );

  const selectedIndex = visible.findIndex((p) => p.id === selectedId);
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : null;

  useEffect(() => {
    if (selectedId && selectedIndex === -1) setSelectedId(null);
  }, [selectedId, selectedIndex]);

  const step = useCallback(
    (delta: number) => {
      if (!visible.length) return;
      const base = selectedIndex === -1 ? 0 : selectedIndex + delta;
      const next = ((base % visible.length) + visible.length) % visible.length;
      setSelectedId(visible[next].id);
    },
    [visible, selectedIndex],
  );

  /** Keyboard navigation between floats; ignored while typing in a control. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const hovering = hoveredId !== null;

  return (
    <div className="app">
      <Toolbar
        month={month}
        onMonthChange={setMonth}
        visibleCount={visible.length}
        totalCount={profiles.length}
        onResetView={() => controls.current?.reset()}
      />

      <main className={`viewport${hovering ? ' viewport--pointer' : ''}`}>
        {!webgl ? (
          <StatusScreen
            title="3D view unavailable"
            detail="This browser could not start WebGL. Try a recent desktop browser, or enable hardware acceleration, to view the ocean volume."
          />
        ) : status === 'loading' ? (
          <StatusScreen title="Loading profiles" detail="Preparing the Indian Ocean float dataset." />
        ) : status === 'error' ? (
          <StatusScreen
            title="Profiles could not be loaded"
            detail="The profile source did not respond."
            onRetry={fetchProfiles}
          />
        ) : (
          <Scene
            ref={controls}
            profiles={visible}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={(p) => setSelectedId(p.id)}
            onHover={(p) => setHoveredId(p?.id ?? null)}
            onClearSelection={() => setSelectedId(null)}
          />
        )}

        <p className="hint">
          Drag to rotate · right-drag to pan · scroll to zoom · click a float · arrow keys step through floats
        </p>
        {webgl && status === 'ready' && <Legend />}

        <ProfilePanel
          profile={selected}
          index={Math.max(selectedIndex, 0)}
          total={visible.length}
          onClose={() => setSelectedId(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
        />
      </main>
    </div>
  );
}
