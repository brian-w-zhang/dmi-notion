'use client'

import { useState } from 'react'
import NeedCurveGraph, { NeedConfig, NeedCurveParams, NeedCurveType } from './NeedCurveGraph'
import overridesData from '../public/data/character_need_overrides.json'

export interface NeedValue {
  name: string
  value: number
  color: string
}

interface CharacterOverride {
  params: NeedCurveParams
  blurb: string
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
        const cfg: NeedConfig = override
          ? { ...base, params: { ...base.params, ...override.params } }
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
                        overrideParams={override?.params}
                        color={cfg.color}
                      />
                      {!override && (
                        <span style={{ color: '#444', marginLeft: 6 }}>(default curve)</span>
                      )}
                    </p>
                    {override && (
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
                    {override ? override.blurb : base.blurb}
                  </p>
                </div>
              ) : (
                <NeedCurveGraph
                  config={cfg}
                  currentValue={need.value}
                  defaultConfig={override ? base : undefined}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
