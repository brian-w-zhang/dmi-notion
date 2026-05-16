'use client'

// Five OCEAN axes evenly spaced at 72°, starting from the top (-90°)
const TRAITS = [
  { key: 'o', letter: 'O' },
  { key: 'c', letter: 'C' },
  { key: 'e', letter: 'E' },
  { key: 'a', letter: 'A' },
  { key: 'n', letter: 'N' },
] as const

const ANGLES = TRAITS.map((_, i) => -90 + i * 72) // degrees
const SIZE = 180
const CX = SIZE / 2
const CY = SIZE / 2
const R = 58
const LABEL_R = R + 18
const RINGS = [0.25, 0.5, 0.75, 1.0]

function toRad(deg: number) { return (deg * Math.PI) / 180 }

function pt(v: number, angleDeg: number): [number, number] {
  return [
    CX + v * R * Math.cos(toRad(angleDeg)),
    CY + v * R * Math.sin(toRad(angleDeg)),
  ]
}

function ringPoints(v: number) {
  return ANGLES.map((a) => pt(v, a).map((n) => n.toFixed(1)).join(',')).join(' ')
}

function labelAnchor(lx: number): 'middle' | 'start' | 'end' {
  if (lx > CX + 8) return 'start'
  if (lx < CX - 8) return 'end'
  return 'middle'
}

export interface Big5 {
  o: number; c: number; e: number; a: number; n: number
}

interface Props {
  scores: Big5
  color?: string
}

export default function PersonalityRadar({ scores, color = '#818cf8' }: Props) {
  const values: number[] = [scores.o, scores.c, scores.e, scores.a, scores.n]
  const dataPoints = values.map((v, i) => pt(v, ANGLES[i]))
  const dataPolygon = dataPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
    >
      {/* Grid rings */}
      {RINGS.map((r) => (
        <polygon
          key={r}
          points={ringPoints(r)}
          fill="none"
          stroke="#383838"
          strokeWidth={r === 1.0 ? 0.75 : 0.5}
        />
      ))}

      {/* Axis lines */}
      {ANGLES.map((a, i) => {
        const [x, y] = pt(1, a)
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#374151" strokeWidth={0.5} />
      })}

      {/* Data polygon */}
      <polygon
        points={dataPolygon}
        fill={color}
        fillOpacity={0.15}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Data dots */}
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill={color} />
      ))}

      {/* Single-letter axis labels */}
      {TRAITS.map((t, i) => {
        const scale = LABEL_R / R
        const [lx, ly] = pt(scale, ANGLES[i])
        const anchor = labelAnchor(lx)
        return (
          <text
            key={t.key}
            x={lx}
            y={ly + 4}
            textAnchor={anchor}
            fill="#E8E8E8"
            fontSize={11}
            fontFamily="monospace"
            fontWeight={600}
          >
            {t.letter}
          </text>
        )
      })}
    </svg>
  )
}
