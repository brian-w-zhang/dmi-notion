'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import objectsData from '../../../public/data/objects.json'

interface WorldObject {
  label: string
  zone: string
  entityType: string
  owner: string | null
  description: string
  position?: { x: number; y: number }
  state?: {
    sitPoints?: boolean[]
    inUse?: boolean
    dirty?: boolean
    open?: boolean
  }
}

function StateDisplay({ state }: { state: NonNullable<WorldObject['state']> }) {
  const rows: { label: string; value: string; active: boolean }[] = []

  if (state.sitPoints !== undefined) {
    if (state.sitPoints.length === 1) {
      rows.push({ label: '', value: state.sitPoints[0] ? 'occupied' : 'free', active: state.sitPoints[0] })
    } else {
      state.sitPoints.forEach((occupied, i) => {
        rows.push({ label: `S${i + 1}`, value: occupied ? 'occupied' : 'free', active: occupied })
      })
    }
  }
  if (state.inUse !== undefined) rows.push({ label: '', value: state.inUse ? 'in use' : 'free', active: state.inUse })
  if (state.dirty !== undefined) rows.push({ label: '', value: state.dirty ? 'dirty' : 'clean', active: state.dirty })
  if (state.open !== undefined) rows.push({ label: '', value: state.open ? 'open' : 'closed', active: state.open })

  return (
    <div className="flex flex-col gap-0.5">
      {rows.map(({ label, value, active }, i) => (
        <span
          key={i}
          className="text-[10px] text-[#E8E8E8]"
        >
          {label ? `${label} · ${value}` : value}
        </span>
      ))}
    </div>
  )
}

const CHARACTER_LABELS: Record<string, string> = {
  jim: 'Jim', dwight: 'Dwight', michael: 'Michael', pam: 'Pam',
  toby: 'Toby', ryan: 'Ryan', kelly: 'Kelly', oscar: 'Oscar',
  angela: 'Angela', stanley: 'Stanley', kevin: 'Kevin',
  phyllis: 'Phyllis', creed: 'Creed', meredith: 'Meredith',
}

const CHARACTER_COLORS: Record<string, string> = {
  jim: '#60a5fa', dwight: '#facc15', michael: '#f97316', pam: '#f9a8d4',
  toby: '#94a3b8', ryan: '#a78bfa', kelly: '#fb7185', oscar: '#34d399',
  angela: '#c084fc', stanley: '#fb923c', kevin: '#6ee7b7',
  phyllis: '#f472b6', creed: '#a3e635', meredith: '#fcd34d',
}

const ZONE_ORDER = [
  'lobby',
  'far lobby',
  'entrance hallway',
  'reception',
  "michael's office",
  'accounting',
  'sales',
  'annex',
  'conference_room',
  'kitchen',
  'break room',
  "men's bathroom",
  "women's bathroom",
  'closet',
  'parking lot ',
]

const ZONE_LABELS: Record<string, string> = {
  'lobby': 'Lobby',
  'far lobby': 'Far Lobby',
  'entrance hallway': 'Entrance Hallway',
  'reception': 'Reception',
  "michael's office": "Michael's Office",
  'accounting': 'Accounting',
  'sales': 'Sales',
  'annex': 'Annex',
  'conference_room': 'Conference Room',
  'kitchen': 'Kitchen',
  'break room': 'Break Room',
  "men's bathroom": "Men's Bathroom",
  "women's bathroom": "Women's Bathroom",
  'closet': 'Closet',
  'parking lot ': 'Parking Lot',
}

const TYPE_ORDER = ['appliance', 'table', 'chair', 'storage']
const TYPE_LABELS: Record<string, string> = {
  appliance: 'Appliances',
  table: 'Desks & Tables',
  chair: 'Seating',
  storage: 'Storage',
}

const allObjects = objectsData.objects as Record<string, WorldObject>

const objectsByZone: Record<string, { id: string; obj: WorldObject }[]> = {}
for (const [id, obj] of Object.entries(allObjects)) {
  const zone = obj.zone
  if (!objectsByZone[zone]) objectsByZone[zone] = []
  objectsByZone[zone].push({ id, obj })
}

const ALL_ZONES = [
  ...ZONE_ORDER.filter((z) => objectsByZone[z]?.length > 0),
  ...Object.keys(objectsByZone).filter(
    (z) => !ZONE_ORDER.includes(z) && objectsByZone[z].length > 0
  ),
]

function OwnerBadge({ owner }: { owner: string }) {
  const color = CHARACTER_COLORS[owner] ?? '#9B9B9B'
  const label = CHARACTER_LABELS[owner] ?? owner
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
      style={{ color, backgroundColor: `${color}18` }}
    >
      {label}
    </span>
  )
}

export default function ObjectsPage() {
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const zones = selectedZone ? [selectedZone] : ALL_ZONES

  return (
    <div className="h-full relative overflow-hidden text-[#E8E8E8]">
      {/* Background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/pam-art.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/78" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col px-6 py-5 gap-5 min-h-0">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-[#E8E8E8] hover:text-white transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Back
          </Link>

          <div className="flex items-center gap-4">
            {/* Zone filter */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                title="Filter by zone"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs transition-colors ${
                  selectedZone
                    ? 'border-[#E8E8E8]/40 text-[#E8E8E8] bg-white/10'
                    : 'border-[#383838]/60 text-[#9B9B9B] hover:text-[#C0C0C0] hover:border-[#555]'
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="3" x2="11" y2="3" />
                  <line x1="3" y1="6" x2="9" y2="6" />
                  <line x1="5" y1="9" x2="7" y2="9" />
                </svg>
                {selectedZone ? (ZONE_LABELS[selectedZone] ?? selectedZone) : 'All zones'}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] backdrop-blur-md bg-black/80 border border-[#383838]/70 rounded-lg py-1 shadow-xl">
                  <button
                    onClick={() => { setSelectedZone(null); setDropdownOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      selectedZone === null
                        ? 'text-[#E8E8E8] bg-white/10'
                        : 'text-[#9B9B9B] hover:text-[#E8E8E8] hover:bg-white/5'
                    }`}
                  >
                    All zones
                  </button>
                  <div className="my-1 border-t border-[#2A2A2A]" />
                  {ALL_ZONES.map((z) => (
                    <button
                      key={z}
                      onClick={() => { setSelectedZone(z); setDropdownOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        selectedZone === z
                          ? 'text-[#E8E8E8] bg-white/10'
                          : 'text-[#9B9B9B] hover:text-[#E8E8E8] hover:bg-white/5'
                      }`}
                    >
                      {ZONE_LABELS[z] ?? z}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-[10px] font-medium tracking-widest uppercase text-[#E8E8E8]">
              Objects
            </span>
          </div>
        </div>

        {/* Scrollable zone list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
          {zones.map((zone) => {
            const entries = objectsByZone[zone] ?? []
            if (entries.length === 0) return null

            const byType: Record<string, { id: string; obj: WorldObject }[]> = {}
            for (const entry of entries) {
              const t = entry.obj.entityType ?? 'unknown'
              if (!byType[t]) byType[t] = []
              byType[t].push(entry)
            }
            const presentTypes = TYPE_ORDER.filter((t) => byType[t])

            return (
              <div
                key={zone}
                className="backdrop-blur-md bg-black/45 border border-[#383838]/60 rounded-xl p-4"
              >
                <h2 className="text-sm font-semibold text-[#E8E8E8] mb-4">
                  {ZONE_LABELS[zone] ?? zone}
                </h2>

                <div className="space-y-5">
                  {presentTypes.map((entityType) => (
                    <div key={entityType}>
                      <p className="text-[10px] font-medium tracking-widest uppercase text-[#6B6B6B] mb-2">
                        {TYPE_LABELS[entityType] ?? entityType}
                      </p>

                      <div className="space-y-0">
                        {byType[entityType].map(({ id, obj }, i) => (
                          <div
                            key={id}
                            className={`flex gap-4 py-2 ${i !== 0 ? 'border-t border-[#1E1E1E]' : ''}`}
                          >
                            {/* Object name + owner */}
                            <div className="w-44 shrink-0">
                              <div className="flex items-start gap-2 flex-wrap">
                                <span className="text-xs text-[#9B9B9B] leading-relaxed">
                                  {obj.label}
                                </span>
                                {obj.owner && <OwnerBadge owner={obj.owner} />}
                              </div>
                              {obj.position && (
                                <span className="text-[10px] text-[#383838] tabular-nums mt-0.5 block">
                                  {obj.position.x}, {obj.position.y}
                                </span>
                              )}
                            </div>

                            {/* Description */}
                            <p className="text-[11px] text-[#5A5A5A] leading-relaxed flex-1">
                              {obj.description}
                            </p>

                            {/* State */}
                            <div className="w-28 shrink-0">
                              {obj.state
                                ? <StateDisplay state={obj.state} />
                                : <span className="text-[10px] text-[#252525]">—</span>
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
