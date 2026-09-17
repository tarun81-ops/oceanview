import type { Profile } from '../data/types';
import { MONTHS } from './months';
import { ProfileChart } from './ProfileChart';

interface Props {
  profile: Profile | null;
  onClose: () => void;
}

export function ProfilePanel({ profile, onClose }: Props) {
  return (
    <aside className={`panel${profile ? ' panel--open' : ''}`} aria-hidden={!profile}>
      {profile && (
        <>
          <div className="panel__head">
            <div>
              <h2>{profile.id}</h2>
              <p className="panel__sub">Argo profile · {MONTHS[profile.month - 1]} 2019</p>
            </div>
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
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
          <ProfileChart series={profile.series} field="temp" color="#e8825a" unit="°C" min={0} max={30} />

          <h3 className="chart-title">Salinity against depth</h3>
          <ProfileChart series={profile.series} field="sal" color="#3fc8d4" unit=" psu" min={34} max={36} />
        </>
      )}
    </aside>
  );
}
