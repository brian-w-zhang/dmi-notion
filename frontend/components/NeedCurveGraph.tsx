'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ReferenceDot, Tooltip, ResponsiveContainer } from 'recharts'

export type NeedCurveType = 'convex' | 'u-shaped' | 'concave' | 'ascending'

export interface NeedCurveParams {
  power?: number
  amplitude?: number
  midpoint?: number
  baseline?: number
}

export interface NeedConfig {
  label: string
  group: string
  curve: NeedCurveType
  params: NeedCurveParams
  color: string
  blurb?: string
}

export function computeUrgency(v: number, curve: NeedCurveType, params: NeedCurveParams): number {
  const t = v / 100
  switch (curve) {
    case 'convex':
      return Math.pow(1 - t, params.power ?? 2.5)
    case 'u-shaped': {
      const a = params.amplitude ?? 2.5
      const m = params.midpoint ?? 0.5
      const b = params.baseline ?? 0.05
      return Math.min(1, Math.max(0, a * Math.pow(t - m, 2) + b))
    }
    case 'concave': {
      const a = params.amplitude ?? 0.8
      const p = params.power ?? 0.5
      const b = params.baseline ?? 0.05
      return Math.min(1, Math.max(0, a * Math.pow(1 - t, p) + b))
    }
    case 'ascending':
      return Math.pow(t, params.power ?? 2.0)
    default:
      return 0
  }
}

const DATA = Array.from({ length: 21 }, (_, i) => ({ v: i * 5 }))

// approximate rendered tooltip width for flip threshold
const TOOLTIP_W = 76
const FLIP_THRESHOLD = TOOLTIP_W + 20

interface Props {
  config: NeedConfig
  currentValue: number
  defaultConfig?: NeedConfig
}

export default function NeedCurveGraph({ config, currentValue, defaultConfig }: Props) {
  const { curve, params, color } = config
  const data = DATA.map(({ v }) => ({
    v,
    u: computeUrgency(v, curve, params),
    ...(defaultConfig ? { u0: computeUrgency(v, defaultConfig.curve, defaultConfig.params) } : {}),
  }))
  const currentU = computeUrgency(currentValue, curve, params)

  const [coord, setCoord] = useState<{ x: number; y: number } | null>(null)

  const tooltipPosition = coord
    ? {
        x: coord.x < FLIP_THRESHOLD ? coord.x + 10 : coord.x - TOOLTIP_W - 10,
        y: coord.y - 28,
      }
    : undefined

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 10, right: 16, bottom: 6, left: 4 }}
        onMouseMove={(state) => {
          const c = (state as { activeCoordinate?: { x: number; y: number } }).activeCoordinate
          if (c) setCoord(c)
        }}
        onMouseLeave={() => setCoord(null)}
      >
        <XAxis
          dataKey="v"
          type="number"
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tick={{ fill: '#555', fontSize: 8, fontFamily: 'monospace' }}
          tickLine={{ stroke: '#444' }}
          axisLine={false}
          height={14}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 1]}
          ticks={[0, 0.5, 1]}
          tickFormatter={(v: number) => v === 0.5 ? '.5' : String(v)}
          tick={{ fill: '#555', fontSize: 8, fontFamily: 'monospace' }}
          tickLine={{ stroke: '#444' }}
          axisLine={false}
          width={20}
        />
        <Tooltip
          cursor={{ stroke: '#444', strokeWidth: 1, strokeDasharray: '3 3' }}
          allowEscapeViewBox={{ x: true, y: true }}
          position={tooltipPosition}
          isAnimationActive={false}
          wrapperStyle={{ transition: 'none' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const v = payload[0]?.payload?.v as number
            const u = payload[0]?.value as number
            return (
              <div style={{
                background: '#1e1e1e',
                border: '1px solid #383838',
                borderRadius: 4,
                padding: '3px 7px',
                fontSize: 10,
                fontFamily: 'monospace',
                color: '#9B9B9B',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                {v} <span style={{ color: '#555' }}>/</span> {u.toFixed(2)}
              </div>
            )
          }}
        />
        <ReferenceLine x={currentValue} stroke="#ffffff" strokeWidth={0.75} strokeDasharray="2 2" strokeOpacity={0.25} />
        {defaultConfig && (
          <Line
            type="monotone"
            dataKey="u0"
            stroke="#4a4a4a"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
            legendType="none"
          />
        )}
        <Line
          type="monotone"
          dataKey="u"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          opacity={0.85}
        />
        <ReferenceDot x={currentValue} y={currentU} r={3} fill={color} stroke="none" />
      </LineChart>
    </ResponsiveContainer>
  )
}
