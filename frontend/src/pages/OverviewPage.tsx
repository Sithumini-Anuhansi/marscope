import { ActivityTimeline } from '../components/dashboard/ActivityTimeline'
import { CrewStatus } from '../components/dashboard/CrewStatus'
import { DashboardCard } from '../components/dashboard/DashboardCard'
import { EnvironmentOverview } from '../components/dashboard/EnvironmentOverview'
import { MissionStatus } from '../components/dashboard/MissionStatus'
import { RecentObservations } from '../components/dashboard/RecentObservations'
import { ResourceOverview } from '../components/dashboard/ResourceOverview'
import { MarsMapPreview } from '../components/map/MarsMapPreview'
import { SAMPLE_OVERVIEW } from '../data/sampleOverview'

export function OverviewPage() {
  const snapshot = SAMPLE_OVERVIEW

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[11px] tracking-[0.28em] text-gold uppercase">
          Mission control
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-sand md:text-3xl">Overview</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Dashboard for ANORA surface operations. Metrics on this page use clearly labeled sample
          data until the FastAPI services and scientific datasets are connected.
        </p>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <MarsMapPreview markers={snapshot.mapMarkers} />

        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MissionStatus mission={snapshot.mission} />
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
            <DashboardCard title="Identified hazards" eyebrow="Sample count">
              <p className="font-mono text-3xl text-mars md:text-4xl">{snapshot.hazardCount}</p>
              <p className="mt-2 text-xs text-muted">
                Example counter for flagged surface features. Not derived from ingested rasters.
              </p>
            </DashboardCard>
            <DashboardCard title="Safe exploration sites" eyebrow="Sample count">
              <p className="font-mono text-3xl text-ok md:text-4xl">{snapshot.safeLocationCount}</p>
              <p className="mt-2 text-xs text-muted">
                Candidate hold points for later terrain and hazard screening.
              </p>
            </DashboardCard>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EnvironmentOverview readings={snapshot.environment} />
        <CrewStatus crew={snapshot.crew} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ResourceOverview resources={snapshot.resources} />
        <RecentObservations observations={snapshot.observations} />
        <ActivityTimeline events={snapshot.timeline} />
      </div>
    </div>
  )
}
