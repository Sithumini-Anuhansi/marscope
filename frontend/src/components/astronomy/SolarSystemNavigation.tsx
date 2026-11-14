import { ChevronRight, Orbit } from 'lucide-react'
import { Link } from 'react-router-dom'

export function SolarSystemNavigation({ inMarsSystem, selectedName, onOverview, onMars }: { inMarsSystem: boolean; selectedName?: string; onOverview: () => void; onMars: () => void }) {
  return <nav aria-label="Solar system explorer breadcrumb" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-void/65 px-4 py-3">
    <ol className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
      <li><button type="button" onClick={onOverview} className={!inMarsSystem ? 'text-gold' : 'text-muted hover:text-sand'}>Solar System</button></li>
      {inMarsSystem ? <><li aria-hidden="true"><ChevronRight className="h-3 w-3 text-muted"/></li><li><button type="button" onClick={onMars} className={!selectedName || selectedName === 'Mars' ? 'text-gold' : 'text-muted hover:text-sand'}>Mars System</button></li>{selectedName && selectedName !== 'Mars' ? <><li aria-hidden="true"><ChevronRight className="h-3 w-3 text-muted"/></li><li className="text-gold">{selectedName}</li></> : null}</> : null}
    </ol>
    <span className="flex items-center gap-3 text-[10px]"><span className="inline-flex items-center gap-1 text-muted"><Orbit className="h-3 w-3 text-gold"/>MARSCOPE ASTRONOMY</span><Link to="/explorer" className="text-gold hover:text-sand">Open Mars Explorer →</Link></span>
  </nav>
}
