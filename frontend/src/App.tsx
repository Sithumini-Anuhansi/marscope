import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoadingPanel } from './components/common/LoadingPanel'
import { AppLayout } from './components/layout/AppLayout'
import { CollaborativeMappingPage } from './pages/CollaborativeMappingPage'
import { CrewTrackingPage } from './pages/CrewTrackingPage'
import { HazardAnalysisPage } from './pages/HazardAnalysisPage'
import { MissionReportsPage } from './pages/MissionReportsPage'
import { OverviewPage } from './pages/OverviewPage'
import { ReturnFeasibilityPage } from './pages/ReturnFeasibilityPage'
import { RiskAssessmentPage } from './pages/RiskAssessmentPage'
import { RoutePlanningPage } from './pages/RoutePlanningPage'
import { SettingsPage } from './pages/SettingsPage'
import { SurvivalAssessmentPage } from './pages/SurvivalAssessmentPage'
import { WhereAmIPage } from './pages/WhereAmIPage'

// Cesium is heavy, so the Mars Explorer route is loaded on demand.
const MarsExplorerPage = lazy(() =>
  import('./pages/MarsExplorerPage').then((module) => ({ default: module.MarsExplorerPage })),
)
const SolarSystemExplorerPage = lazy(() =>
  import('./pages/SolarSystemExplorerPage').then((module) => ({ default: module.SolarSystemExplorerPage })),
)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<WhereAmIPage />} />
          <Route path="dashboard" element={<OverviewPage />} />
          <Route
            path="explorer"
            element={
              <Suspense fallback={<LoadingPanel label="Loading Mars Explorer…" />}>
                <MarsExplorerPage />
              </Suspense>
            }
          />
          <Route
            path="solar-system"
            element={
              <Suspense fallback={<LoadingPanel label="Loading Solar System Explorer…" />}>
                <SolarSystemExplorerPage />
              </Suspense>
            }
          />
          <Route path="hazards" element={<HazardAnalysisPage />} />
          <Route path="risk" element={<RiskAssessmentPage />} />
          <Route path="routes" element={<RoutePlanningPage />} />
          <Route path="crew" element={<CrewTrackingPage />} />
          <Route path="mapping" element={<CollaborativeMappingPage />} />
          <Route path="survival" element={<SurvivalAssessmentPage />} />
          <Route path="return" element={<ReturnFeasibilityPage />} />
          <Route path="reports" element={<MissionReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
