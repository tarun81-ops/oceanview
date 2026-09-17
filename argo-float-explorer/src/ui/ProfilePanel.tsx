import { useEffect, useRef } from 'react';
import type { Profile } from '../data/types';
import { MONTHS } from './months';
import { ProfileChart } from './ProfileChart';

interface Props {
  profile: Profile | null;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function ProfilePanel({ profile, index, total, onClose, onPrev, onNext }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (profile) headingRef.current?.focus();
  }, [profile?.id]);

  return (
    <aside
      className={`panel${profile ? ' panel--open' : ''}`}
      role="region"
      aria-label="Selected float profile"
      aria-live="polite"
      aria-hidden={!profile}
    >
      {profile && (
        <>
          <div className="panel__head">
            <div>
              <h2 ref={headingRef} tabIndex={-1}>
                {profile.id}
              </h2>
              <p className="panel__sub">
                Argo profile {index + 1} of {total} · {MONTHS[profile.month - 1]} 2019
              </p>
            </div>
            <button type="button" className="btn" onClick={onClose} aria-label="Close profile panel">
              Close
            </button>
          </div>

          <div className="panel__nav">
            <button type="button" className="btn" onClick={onPrev} aria-label="Show previous float profile">
              ← Previous
            </button>
            <button type="button" className="btn" onClick={onNext} aria-label="Show next float profile">
              Next →
            </button>
            <p className="panel__keys">Arrow keys move between floats · Esc closes</p>
          </div>

          <dl className="readout">
            <div>
              <dt>Latitude</dt>
              <dd>{profile.lat.toFixed(2)}°</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{profile.lon.toFixed(2)}°</dd>
            </div>
            <div>
              <dt>Month</dt>
              <dd>{MONTHS[profile.month - 1]} 2019</dd>
            </div>
            <div>
              <dt>Surface temp</dt>
              <dd>{profile.surfaceTemp.toFixed(2)} °C</dd>
            </div>
          </dl>

          <h3 className="chart-title">Temperature against depth</h3>
          <ProfileChart
            series={profile.series}
            field="temp"
            color="#e8825a"
            axisLabel="Temperature (°C)"
            min={0}
            max={30}
            ticks={[0, 10, 20, 30]}
          />

          <h3 className="chart-title">Salinity against depth</h3>
          <ProfileChart
            series={profile.series}
            field="sal"
            color="#3fc8d4"
            axisLabel="Salinity (psu)"
            min={34}
            max={36}
            ticks={[34, 34.5, 35, 35.5, 36]}
          />
        </>
      )}
    </aside>
  );
}
