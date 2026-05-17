'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import appliancesData from '../../../public/assets/world/appliances.json'
import officeObjectsData from '../../../public/assets/world/office-objects.json'
import needsConfig from '../../../public/data/needs_config.json'
import characterActionsData from '../../../public/data/character_actions.json'

const NEED_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(needsConfig).map(([k, v]) => [k, (v as { color: string }).color])
)

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

interface SitPoint {
  id: number
  name: string
  position: { x: number; y: number }
  facing: string
}

interface Entity {
  id: number
  name: string
  entityType?: string
  zone?: string
  owner?: string | null
  sitPoints?: SitPoint[]
  actionPoints?: { id: number; name: string }[]
  actions?: { id: string; name: string; durationMs?: number }[]
}

interface ApplianceAction {
  id: string
  name: string
  emoji?: string
  durationMs?: number
  needDeltas?: Record<string, number>
}

interface CharacterAction {
  id: string
  actor: string
  advertiser: string
  name: string
  durationMs?: number
  actorNeedDeltas?: Record<string, number>
  advertiserNeedDeltas?: Record<string, number>
  preconditions?: { type: string; [key: string]: unknown }[]
}

interface CharacterPair {
  id: string
  characters: [string, string]
  label: string
  blurb: string
  actions: CharacterAction[]
}

const actionsByObject: Record<string, ApplianceAction[]> = {}
for (const appliance of appliancesData.appliances) {
  actionsByObject[appliance.objectName] = appliance.actions as ApplianceAction[]
}

const allEntities = Object.values(
  officeObjectsData.entitiesById as Record<string, Entity>
)

const entitiesByZone: Record<string, Entity[]> = {}
for (const entity of allEntities) {
  const zone = entity.zone ?? 'unknown'
  if (!entitiesByZone[zone]) entitiesByZone[zone] = []
  entitiesByZone[zone].push(entity)
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

const ENTITY_TYPE_ORDER = ['appliance', 'chair', 'table', 'storage']
const ENTITY_TYPE_LABELS: Record<string, string> = {
  appliance: 'Appliances',
  chair: 'Seating',
  table: 'Tables',
  storage: 'Storage',
}

function fmt(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c, offset, str) =>
    str[offset - 1] === "'" ? c : c.toUpperCase()
  )
}

const ALL_ZONES = [
  ...ZONE_ORDER.filter((z) => entitiesByZone[z]?.length > 0),
  ...Object.keys(entitiesByZone).filter(
    (z) => !ZONE_ORDER.includes(z) && entitiesByZone[z].length > 0
  ),
]

function NeedDeltaBadge({ need, delta }: { need: string; delta: number }) {
  const color = NEED_COLORS[need] ?? '#9B9B9B'
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums"
      style={{ color, backgroundColor: `${color}18` }}
    >
      {delta > 0 ? '+' : ''}{delta} {need}
    </span>
  )
}

function CharacterBadge({ id, dim }: { id: string; dim?: boolean }) {
  const color = CHARACTER_COLORS[id] ?? '#9B9B9B'
  const label = CHARACTER_LABELS[id] ?? id
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{
        color: dim ? `${color}99` : color,
        backgroundColor: `${color}18`,
      }}
    >
      {label}
    </span>
  )
}

function WorldActionsView({ selectedZone }: { selectedZone: string | null }) {
  const zones = selectedZone ? [selectedZone] : ALL_ZONES

  return (
    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        {zones.map((zone) => {
          const entities = entitiesByZone[zone] ?? []
          const byType: Record<string, Entity[]> = {}
          for (const e of entities) {
            const t = e.entityType ?? 'unknown'
            if (!byType[t]) byType[t] = []
            byType[t].push(e)
          }
          const presentTypes = ENTITY_TYPE_ORDER.filter((t) => byType[t])
          if (presentTypes.length === 0) return null

          return (
            <div
              key={zone}
              className="backdrop-blur-md bg-black/45 border border-[#383838]/60 rounded-xl p-4"
            >
              <h2 className="text-sm font-semibold text-[#E8E8E8] mb-4 capitalize">
                {fmt(zone)}
              </h2>

              <div className="space-y-5">
                {presentTypes.map((entityType) => (
                  <div key={entityType}>
                    <p className="text-[10px] font-medium tracking-widest uppercase text-[#6B6B6B] mb-2">
                      {ENTITY_TYPE_LABELS[entityType]}
                    </p>

                    {(() => {
                      const getActions = (entity: Entity): ApplianceAction[] =>
                        entityType === 'appliance'
                          ? (actionsByObject[entity.name] ?? [])
                          : ((entity.actions ?? []) as ApplianceAction[])

                      const withActions = byType[entityType].filter(
                        (e) => getActions(e).length > 0
                      )
                      const withoutActions = byType[entityType].filter(
                        (e) => getActions(e).length === 0
                      )

                      return (
                        <>
                          {withActions.length > 0 && (
                            <table className="w-full text-xs border-collapse mb-2">
                              <thead>
                                <tr className="text-[#4A4A4A]">
                                  <th className="text-left pb-1.5 font-normal pr-6 w-44">Object</th>
                                  <th className="text-left pb-1.5 font-normal pr-6 w-36">Action</th>
                                  <th className="text-left pb-1.5 font-normal pr-6 w-16">Duration</th>
                                  <th className="text-left pb-1.5 font-normal text-[#3A3A3A]">Need Deltas</th>
                                </tr>
                              </thead>
                              <tbody>
                                {withActions.map((entity) => {
                                  const actions = getActions(entity)
                                  return actions.map((action, i) => (
                                    <tr
                                      key={`${entity.name}-${action.id}`}
                                      className="border-t border-[#222]"
                                    >
                                      {i === 0 && (
                                        <td
                                          className="py-1.5 text-[#9B9B9B] pr-6 align-top"
                                          rowSpan={actions.length}
                                        >
                                          {fmt(entity.name)}
                                          {entity.owner && (
                                            <span className="ml-1.5 text-[#4A4A4A] capitalize">
                                              ({entity.owner})
                                            </span>
                                          )}
                                        </td>
                                      )}
                                      <td className="py-1.5 text-[#E8E8E8] pr-6">
                                        <span className="flex items-center gap-1.5">
                                          {action.emoji && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={`/assets/ui/emojis_16x16/${action.emoji}.png`}
                                              alt={action.emoji}
                                              width={16}
                                              height={16}
                                              className="shrink-0"
                                              style={{ imageRendering: 'pixelated' }}
                                            />
                                          )}
                                          {action.name}
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-[#9B9B9B] pr-6 tabular-nums">
                                        {action.durationMs != null
                                          ? `${(action.durationMs / 1000).toFixed(1)}s`
                                          : '—'}
                                      </td>
                                      <td className="py-1.5">
                                        {action.needDeltas && Object.keys(action.needDeltas).length > 0 ? (
                                          <span className="flex flex-wrap gap-1">
                                            {Object.entries(action.needDeltas).map(([need, delta]) => (
                                              <NeedDeltaBadge key={need} need={need} delta={delta} />
                                            ))}
                                          </span>
                                        ) : (
                                          <span className="text-[#383838]">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))
                                })}
                              </tbody>
                            </table>
                          )}

                          {withoutActions.length > 0 && (
                            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-4">
                              {withoutActions.map((entity) => (
                                <div
                                  key={entity.name}
                                  className="flex items-center justify-between py-1 px-2.5 bg-[#141414]/70 border border-[#262626]/60 rounded"
                                >
                                  <span className="text-[11px] text-[#9B9B9B] truncate">
                                    {fmt(entity.name)}
                                  </span>
                                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                    {entity.owner && (
                                      <span className="text-[11px] text-[#5A5A5A] capitalize">
                                        {entity.owner}
                                      </span>
                                    )}
                                    {entity.sitPoints && entity.sitPoints.length > 0 && (
                                      <span className="text-[10px] text-[#404040] tabular-nums">
                                        {entity.sitPoints.length}×
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
  )
}

function CharacterActionsView() {
  const pairs = characterActionsData.pairs as CharacterPair[]
  const universalDesc = (characterActionsData as { universalActions?: { talk_to?: { description?: string } } }).universalActions?.talk_to?.description ?? ''

  return (
    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
      {/* Universal implied action */}
      <div className="px-4 py-2.5 backdrop-blur-md bg-black/45 border border-[#383838]/60 rounded-xl flex items-start gap-3">
        <span className="text-[10px] font-medium tracking-widest uppercase text-[#4A4A4A] shrink-0 mt-px">Implied</span>
        <p className="text-[11px] text-[#5A5A5A] leading-relaxed">
          <span className="text-[#6B6B6B] font-medium">Talk To</span>
          {' — '}{universalDesc}
        </p>
      </div>

      {pairs.map((pair) => (
        <div
          key={pair.id}
          className="backdrop-blur-md bg-black/45 border border-[#383838]/60 rounded-xl p-4"
        >
          {/* Pair header */}
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-sm font-semibold text-[#E8E8E8]">{pair.label}</h2>
            <div className="flex gap-1.5 shrink-0 ml-4">
              {pair.characters.map((c) => (
                <CharacterBadge key={c} id={c} />
              ))}
            </div>
          </div>
          <p className="text-[11px] text-[#5A5A5A] mb-4 leading-relaxed">{pair.blurb}</p>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-[#4A4A4A]">
                <th className="text-left pb-1.5 font-normal pr-4 w-20">Actor</th>
                <th className="text-left pb-1.5 font-normal pr-4 w-40">Action</th>
                <th className="text-left pb-1.5 font-normal pr-4 w-14">Duration</th>
                <th className="text-left pb-1.5 font-normal pr-4">Actor Deltas</th>
                <th className="text-left pb-1.5 font-normal text-[#3A3A3A]">Target Deltas</th>
              </tr>
            </thead>
            <tbody>
              {pair.actions.map((action) => (
                <tr key={action.id} className="border-t border-[#222]">
                  <td className="py-1.5 pr-4 align-top">
                    <CharacterBadge id={action.actor} />
                  </td>
                  <td className="py-1.5 pr-4 align-top">
                    <span className="text-[#E8E8E8]">{action.name}</span>
                  </td>
                  <td className="py-1.5 pr-4 text-[#9B9B9B] tabular-nums align-top">
                    {action.durationMs != null
                      ? `${(action.durationMs / 1000).toFixed(0)}s`
                      : '—'}
                  </td>
                  <td className="py-1.5 pr-4 align-top">
                    {action.actorNeedDeltas && Object.keys(action.actorNeedDeltas).length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {Object.entries(action.actorNeedDeltas).map(([need, delta]) => (
                          <NeedDeltaBadge key={need} need={need} delta={delta} />
                        ))}
                      </span>
                    ) : (
                      <span className="text-[#383838]">—</span>
                    )}
                  </td>
                  <td className="py-1.5 align-top">
                    <div className="flex items-start gap-1.5">
                      <CharacterBadge id={action.advertiser} dim />
                      <span className="flex flex-wrap gap-1">
                        {action.advertiserNeedDeltas && Object.keys(action.advertiserNeedDeltas).length > 0
                          ? Object.entries(action.advertiserNeedDeltas).map(([need, delta]) => (
                              <NeedDeltaBadge key={need} need={need} delta={delta} />
                            ))
                          : <span className="text-[#383838]">—</span>
                        }
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

type ViewMode = 'world' | 'character'

export default function ActionsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('world')
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false)
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false)

  const viewDropdownRef = useRef<HTMLDivElement>(null)
  const zoneDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target as Node)) {
        setViewDropdownOpen(false)
      }
      if (zoneDropdownRef.current && !zoneDropdownRef.current.contains(e.target as Node)) {
        setZoneDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const VIEW_LABELS: Record<ViewMode, string> = {
    world: 'World Actions',
    character: 'Character Actions',
  }

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
            Simulation
          </Link>

          <div className="flex items-center gap-4">
            {/* Zone filter — world view only */}
            {viewMode === 'world' && (
              <div className="relative" ref={zoneDropdownRef}>
                <button
                  onClick={() => setZoneDropdownOpen((o) => !o)}
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
                  {selectedZone ? fmt(selectedZone) : 'All zones'}
                </button>

                {zoneDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] backdrop-blur-md bg-black/80 border border-[#383838]/70 rounded-lg py-1 shadow-xl">
                    <button
                      onClick={() => { setSelectedZone(null); setZoneDropdownOpen(false) }}
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
                        onClick={() => { setSelectedZone(z); setZoneDropdownOpen(false) }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          selectedZone === z
                            ? 'text-[#E8E8E8] bg-white/10'
                            : 'text-[#9B9B9B] hover:text-[#E8E8E8] hover:bg-white/5'
                        }`}
                      >
                        {fmt(z)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* View mode toggle */}
            <div className="relative" ref={viewDropdownRef}>
              <button
                onClick={() => setViewDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 text-[10px] font-medium tracking-widest uppercase text-[#E8E8E8] hover:text-white transition-colors"
              >
                {VIEW_LABELS[viewMode]}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2,3 5,7 8,3" />
                </svg>
              </button>

              {viewDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 min-w-[170px] backdrop-blur-md bg-black/80 border border-[#383838]/70 rounded-lg py-1 shadow-xl">
                  {(['world', 'character'] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => { setViewMode(mode); setViewDropdownOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        viewMode === mode
                          ? 'text-[#E8E8E8] bg-white/10'
                          : 'text-[#9B9B9B] hover:text-[#E8E8E8] hover:bg-white/5'
                      }`}
                    >
                      {VIEW_LABELS[mode]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* View content */}
        {viewMode === 'world' ? (
          <WorldActionsView selectedZone={selectedZone} />
        ) : (
          <CharacterActionsView />
        )}
      </div>
    </div>
  )
}
