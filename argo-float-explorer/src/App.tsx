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
type SceneStatus = 'pending' | 'ready' | 'failed';

/**
 * How long to wait for the first rendered frame before declaring the 3D view
 * broken. react-three-fiber renders `null` when something inside the canvas
 * throws, so without this watchdog that failure would be an empty viewport.
 */
const SCENE_TIMEOUT_MS = 6000;

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [month, setMonth] = useState<number | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>('pending');
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const controls = useRef<OrbitControlsImpl>(null);
  const webgl = useMemo(isWebGLAvailable, []);

  const fetchProfiles = useCallback(() => {
    setStatus('loading');
    loadProfiles()
      .then((data) => {
        setProfiles(data);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        console.error('Could not load profiles:', error);
        setStatus('error');
      });
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
      // Stepping from "nothing selected" enters the list at the front when going
      // forward and at the back when going backward, then wraps in both directions.
      const from = selectedIndex === -1 ? (delta > 0 ? -1 : 0) : selectedIndex;
      const next = (((from + delta) % visible.length) + visible.length) % visible.length;
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

  const sceneVisible = webgl && status === 'ready' && sceneStatus !== 'failed';

  // Watchdog: a canvas that never draws a frame is a failure, not a blank screen.
  useEffect(() => {
    if (!sceneVisible) return;
    const timer = window.setTimeout(() => {
      setSceneStatus((current) => (current === 'ready' ? current : 'failed'));
    }, SCENE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [sceneVisible, sceneAttempt]);

  const retryScene = useCallback(() => {
    setSceneStatus('pending');
    setSceneAttempt((attempt) => attempt + 1);
  }, []);

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

      <main
        className={`viewport${hovering ? ' viewport--pointer' : ''}${
          selected ? ' viewport--panel-open' : ''
        }`}
      >
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
        ) : sceneStatus === 'failed' ? (
          <StatusScreen
            title="The 3D view stopped responding"
            detail="The WebGL scene did not draw a frame. This is usually a lost GPU context or a disabled graphics driver."
            onRetry={retryScene}
          />
        ) : (
          <Scene
            key={sceneAttempt}
            ref={controls}
            profiles={visible}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={(p) => setSelectedId(p.id)}
            onHover={(p) => setHoveredId(p?.id ?? null)}
            onClearSelection={() => setSelectedId(null)}
            onReady={() => setSceneStatus('ready')}
            onContextLost={retryScene}
          />
        )}

        <p className="hint">
          Drag to rotate · right-drag to pan · scroll to zoom · click a float · arrow keys step through floats
        </p>
        {sceneVisible && sceneStatus === 'ready' && <Legend />}

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
