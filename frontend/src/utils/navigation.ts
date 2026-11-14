import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Compass,
  FileText,
  House,
  Map,
  Orbit,
  Route,
  Settings,
  ShieldExclamationPoint,
  TriangleExclamationPoint,
  Users,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  description: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Where Am I?',
    path: '/',
    description: 'Identify a Mars location and review nearby mission information.',
    icon: Compass,
  },
  {
    label: 'Mission Dashboard',
    path: '/dashboard',
    description: 'Mission status, environment summary, crew, and activity at a glance.',
    icon: House,
  },
  {
    label: 'Solar System Explorer',
    path: '/solar-system',
    description: 'Explore the Solar System and Mars-centered Phobos and Deimos ephemerides.',
    icon: Orbit,
  },
  {
    label: 'Mars Explorer',
    path: '/explorer',
    description: 'Interactive 3D Mars globe with imagery layers, coordinates and a map legend.',
    icon: Compass,
  },
  {
    label: 'Hazard Analysis',
    path: '/hazards',
    description: 'Surface hazard identification, severity ranking, and spatial clustering.',
    icon: TriangleExclamationPoint,
  },
  {
    label: 'Risk Assessment',
    path: '/risk',
    description: 'Location-based terrain features, risk readiness, missing inputs, and explanations.',
    icon: Activity,
  },
  {
    label: 'Route Planning',
    path: '/routes',
    description: 'Safe traverse planning between waypoints with terrain and hazard constraints.',
    icon: Route,
  },
  {
    label: 'Crew Tracking',
    path: '/crew',
    description: 'Live crew locations, duty cycles, and coordination during surface operations.',
    icon: Users,
  },
  {
    label: 'Collaborative Mapping',
    path: '/mapping',
    description: 'Shared map observations, annotations, and crew-to-crew notes.',
    icon: Map,
  },
  {
    label: 'Survival Assessment',
    path: '/survival',
    description: 'Resource margins, habitat viability, and mission survivability checks.',
    icon: ShieldExclamationPoint,
  },
  {
    label: 'Return Feasibility',
    path: '/return',
    description: 'Ascent, rendezvous, and Earth-return window assessment for the crew.',
    icon: Activity,
  },
  {
    label: 'Mission Reports',
    path: '/reports',
    description: 'Sol reports, observation logs, and exportable mission summaries.',
    icon: FileText,
  },
  {
    label: 'Settings',
    path: '/settings',
    description: 'Interface preferences, data source configuration, and operator profile.',
    icon: Settings,
  },
]
