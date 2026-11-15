import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const subtopics: Record<string, { label: string; href: string }[]> = {
    '/': [{ label: 'Map', href: '#location-map' }, { label: 'Position sources', href: '#identify' }, { label: 'Nearby', href: '#nearby' }, { label: 'Safety & routes', href: '#safety' }, { label: 'Survival companion', href: '#survival' }],
    '/explorer': [{ label: 'Marswalk map', href: '#marswalk-map' }, { label: 'Study area', href: '#study-area' }, { label: 'Science demos', href: '#science-demos' }, { label: 'PDS products', href: '#pds-products' }, { label: 'Research maps', href: '#research-maps' }],
    '/risk': [{ label: 'Assessment inputs', href: '#risk-inputs' }, { label: 'Terrain image', href: '#terrain-image' }, { label: 'Model readiness', href: '#risk-readiness' }],
    '/hazards': [{ label: 'Region summary', href: '#hazard-summary' }, { label: 'Data readiness', href: '#hazard-readiness' }, { label: 'Measurements', href: '#hazard-results' }],
    '/routes': [{ label: 'Route map', href: '#route-map' }, { label: 'Mission inputs', href: '#route-inputs' }, { label: 'Candidates', href: '#route-results' }],
    '/crew': [{ label: 'Crew map', href: '#crew-map' }, { label: 'Other missions', href: '#other-missions' }, { label: 'Special locations', href: '#special-locations' }],
  }
  const pageSubtopics = subtopics[pathname]

  useEffect(() => {
    if (!sidebarOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen])

  return (
    <div className="flex min-h-svh bg-void">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
        {pageSubtopics ? <nav aria-label="Page sections" className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b border-line bg-charcoal/95 px-4 py-2 backdrop-blur-md md:px-6">{pageSubtopics.map((topic) => <a key={topic.href} href={topic.href} className="shrink-0 rounded-lg border border-transparent px-3 py-1.5 text-[11px] text-muted hover:border-line hover:bg-panel-alt hover:text-sand">{topic.label}</a>)}</nav> : null}
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
