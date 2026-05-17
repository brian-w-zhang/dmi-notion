'use client'

import { useState } from 'react'
import NeedCurveGraph, { NeedConfig, NeedCurveParams, NeedCurveType, NeedDecay } from './NeedCurveGraph'
import overridesData from '../public/data/character_need_overrides.json'

export interface NeedValue {
  name: string
  value: number
  color: string
}

interface DecayOverride {
  kMultiplier: number
  blurb: string
}

interface CharacterOverride {
  params?: NeedCurveParams
  blurb?: string
  decay?: DecayOverride
}

function humanCycleTime(k: number): string {
  const simMinutes = 500 / k  // 100 pts / k pts-per-tick * 5 min/tick
  if (simMinutes < 120) return `~${Math.round(simMinutes)}min`
  const simHours = simMinutes / 60
  if (simHours < 36) return `~${Math.round(simHours)}h`
  const simDays = simHours / 24
  if (simDays < 14) return `~${simDays < 2 ? simDays.toFixed(1) : Math.round(simDays)}d`
  return `~${Math.round(simDays / 7)}wk`
}

type OverridesMap = Record<string, Record<string, CharacterOverride>>
const ALL_OVERRIDES = overridesData as OverridesMap

interface Props {
  needs: NeedValue[]
  needsConfig: Record<string, NeedConfig>
  slug?: string
}

function Equation({
  curve,
  params,
  overrideParams,
  color,
  dim = false,
}: {
  curve: NeedCurveType
  params: NeedCurveParams
  overrideParams?: NeedCurveParams
  color: string
  dim?: boolean
}) {
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2))
  const c = (key: keyof NeedCurveParams) => !!(overrideParams && key in overrideParams)
  const textColor = dim ? '#555' : '#E8E8E8'

  const V = ({ k }: { k: keyof NeedCurveParams }) => (
    <span style={{ color: (!dim && c(k)) ? color : textColor, fontWeight: (!dim && c(k)) ? 600 : 400 }}>
      {fmt(params[k] ?? 0)}
    </span>
  )

  const str = (s: string) => <span style={{ color: textColor }}>{s}</span>

  switch (curve) {
    case 'convex':
      return <>{str('U(v) = (1 − v/100) ^ ')}<V k="power" /></>
    case 'ascending':
      return <>{str('U(v) = (v/100) ^ ')}<V k="power" /></>
    case 'u-shaped':
      return (
        <>
          {str('U(v) = ')}<V k="amplitude" />
          {str(' × (v/100 − ')}<V k="midpoint" />
          {str(')² + ')}<V k="baseline" />
        </>
      )
    case 'concave':
      return (
        <>
          {str('U(v) = ')}<V k="amplitude" />
          {str(' × (1 − v/100) ^ ')}<V k="power" />
          {str(' + ')}<V k="baseline" />
        </>
      )
    default:
      return null
  }
}

export default function NeedsCurvesPanel({ needs, needsConfig, slug }: Props) {
  const [infoKey, setInfoKey] = useState<string | null>(null)

  const characterOverrides = slug ? (ALL_OVERRIDES[slug] ?? {}) : {}

  return (
    <div className="h-full grid grid-cols-3 grid-rows-4 gap-2">
      {needs.map((need) => {
        const key = need.name.toLowerCase()
        const base = needsConfig[key]
        if (!base) return null

        const override = characterOverrides[key] as CharacterOverride | undefined
        const hasCurveOverride = !!(override?.params && Object.keys(override.params).length > 0)
        const cfg: NeedConfig = hasCurveOverride
          ? { ...base, params: { ...base.params, ...override!.params } }
          : base

        const isInfo = infoKey === key

        return (
          <div
            key={key}
            className="bg-[#252525] border border-[#383838] rounded flex flex-col hover:border-[#4A4A4A] transition-colors"
          >
            {/* Card header */}
            <div className="flex items-center px-3 py-2 border-b border-[#303030] gap-1.5">
              <span className="text-xs font-medium text-[#E8E8E8]">{cfg.label}</span>
              <button
                onClick={() => setInfoKey(isInfo ? null : key)}
                title="Show equation"
                className={`shrink-0 w-3.5 h-3.5 rounded-full border text-[8px] leading-none flex items-center justify-center transition-colors ${
                  isInfo
                    ? 'border-[#9B9B9B] text-[#9B9B9B] bg-[#333]'
                    : 'border-[#4A4A4A] text-[#555] hover:border-[#6B6B6B] hover:text-[#9B9B9B]'
                }`}
              >
                i
              </button>
              <div className="flex-1" />
              <span className="text-xs tabular-nums text-[#9B9B9B]">{need.value}</span>
            </div>

            {/* Chart or info panel */}
            <div className="flex-1 min-h-0">
              {isInfo ? (
                <div className="h-full px-3 py-2.5 flex flex-col gap-2 overflow-y-auto">
                  {/* Equations */}
                  <div className="font-mono text-[9px] leading-relaxed flex flex-col gap-0.5">
                    <p>
                      <Equation
                        curve={cfg.curve}
                        params={cfg.params}
                        overrideParams={hasCurveOverride ? override?.params : undefined}
                        color={cfg.color}
                      />
                      {!hasCurveOverride && (
                        <span style={{ color: '#444', marginLeft: 6 }}>(default curve)</span>
                      )}
                    </p>
                    {hasCurveOverride && (
                      <p>
                        <Equation
                          curve={base.curve}
                          params={base.params}
                          color={cfg.color}
                          dim
                        />
                        <span style={{ color: '#444', marginLeft: 6 }}>(default curve)</span>
                      </p>
                    )}
                  </div>

                  {/* Blurb */}
                  <p className="text-[9px] leading-relaxed text-[#E8E8E8]">
                    {override?.blurb ?? base.blurb}
                  </p>

                  {/* Decay section */}
                  {base.decay && (
                    <div className="border-t border-[#303030] pt-2 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[8px] uppercase tracking-wider font-medium text-[#555]">Decay</span>
                        <span className="text-[8px] px-1 py-0.5 rounded bg-[#1A1A1A] border border-[#333] text-[#666]">
                          {base.decay.type}
                        </span>
                        {base.decay.k !== null ? (
                          <span className="font-mono text-[8px] text-[#555]">
                            k = {base.decay.k} · {humanCycleTime(base.decay.k)} to empty
                          </span>
                        ) : (
                          <span className="font-mono text-[8px] text-[#555]">no passive decay</span>
                        )}
                      </div>
                      <p className="text-[9px] leading-relaxed text-[#9B9B9B]">{base.decay.blurb}</p>

                      {override?.decay && base.decay.k !== null && (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.color }} />
                            <span className="font-mono text-[8px] text-[#9B9B9B]">
                              ×{override.decay.kMultiplier} → k = {(base.decay.k * override.decay.kMultiplier).toFixed(2)} · {humanCycleTime(base.decay.k * override.decay.kMultiplier)} to empty
                            </span>
                          </div>
                          <p className="text-[9px] leading-relaxed text-[#E8E8E8]">{override.decay.blurb}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <NeedCurveGraph
                  config={cfg}
                  currentValue={need.value}
                  defaultConfig={hasCurveOverride ? base : undefined}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
