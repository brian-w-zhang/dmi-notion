'use client'
import { use, useState } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CHARACTER_ASSETS } from '../../../game/config/characters'
import CharacterSprite from '../../../components/CharacterSprite'
import NeedsCurvesPanel from '../../../components/NeedsCurvesPanel'
import PersonalityRadar from '../../../components/PersonalityRadar'
import type { Big5 } from '../../../components/PersonalityRadar'
import needsConfig from '../../../public/data/needs_config.json'
import personalitiesData from '../../../public/data/personalities.json'
import type { NeedConfig } from '../../../components/NeedCurveGraph'

const NEEDS = [
  { name: 'Hunger',       color: 'bg-orange-400', value: 65 },
  { name: 'Thirst',       color: 'bg-cyan-400',   value: 70 },
  { name: 'Bladder',      color: 'bg-lime-400',   value: 55 },
  { name: 'Energy',       color: 'bg-yellow-400', value: 60 },
  { name: 'Stress',       color: 'bg-red-400',    value: 30 },
  { name: 'Health',       color: 'bg-green-400',  value: 90 },
  { name: 'Social',       color: 'bg-blue-400',   value: 80 },
  { name: 'Belonging',    color: 'bg-pink-400',   value: 72 },
  { name: 'Esteem',       color: 'bg-amber-400',  value: 58 },
  { name: 'Stimulation',  color: 'bg-purple-400', value: 45 },
  { name: 'Productivity', color: 'bg-slate-400',  value: 50 },
  { name: 'Fulfillment',  color: 'bg-violet-400', value: 40 },
]

type Tab = 'status' | 'curves'

const TABS: { key: Tab; label: string }[] = [
  { key: 'curves', label: 'Need Curves' },
  { key: 'status', label: 'Status' },
]

export default function CharacterDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const character = CHARACTER_ASSETS.find((c) => c.owner === slug)
  if (!character) notFound()

  const [tab, setTab] = useState<Tab>('curves')

  const personality = (personalitiesData as Record<string, { mbti: string; o: number; c: number; e: number; a: number; n: number }>)[slug]

  return (
    <div className="h-full flex flex-col bg-[#191919] text-[#E8E8E8]">

      {/* Shared header row: breadcrumb (left) + tabs (right), same vertical baseline */}
      <div className="shrink-0 flex items-end gap-5 px-6 pt-5 border-b border-[#383838]">
        {/* Left slot — same width as left panel */}
        <div className="w-64 shrink-0 pb-3">
          <Link
            href="/dashboard"
            className="text-[#9B9B9B] hover:text-[#E8E8E8] transition-colors text-sm"
          >
            ← All characters
          </Link>
        </div>

        {/* Right slot — tabs flush to the border-b */}
        <div className="flex">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm -mb-px transition-colors border-b-2 ${
                tab === key
                  ? 'border-[#E8E8E8] text-[#E8E8E8]'
                  : 'border-transparent text-[#9B9B9B] hover:text-[#E8E8E8]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex-1 flex gap-5 overflow-hidden px-6 pb-6 pt-5 min-h-0">

        {/* ── Left panel ── */}
        <div className="w-64 shrink-0 flex flex-col gap-4 min-h-0">

          {/* Character card */}
          <div className="shrink-0 bg-[#252525] border border-[#383838] rounded p-5 flex flex-col items-center gap-1.5">
            <p className="text-[#E8E8E8] text-lg font-semibold leading-snug text-center">
              {character.displayName}
            </p>
            <CharacterSprite spritePath={character.spritePath} scale={3.5} />
          </div>

          {/* Personality — fills remaining left-panel height */}
          {personality && (
            <div className="flex-1 min-h-0 flex flex-col">
              <p className="shrink-0 text-[10px] font-medium tracking-widest uppercase text-[#6B6B6B] mb-2">
                Personality
              </p>
              <div className="flex-1 min-h-0 bg-[#252525] border border-[#383838] rounded p-4 flex flex-col items-center gap-3">
                <PersonalityRadar scores={personality as Big5} />
                <div className="w-full flex flex-col gap-1.5">
                  {([
                    ['o', 'Openness'],
                    ['c', 'Conscientiousness'],
                    ['e', 'Extraversion'],
                    ['a', 'Agreeableness'],
                    ['n', 'Neuroticism'],
                  ] as [keyof Big5, string][]).map(([k, label]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-[10px] text-[#9B9B9B]">{label}</span>
                      <span className="text-[10px] text-[#E8E8E8] tabular-nums font-medium">
                        {Math.round((personality as Big5)[k] * 100)}
                      </span>
                    </div>
                  ))}
                  {personality.mbti && (
                    <div className="flex items-center justify-between pt-1 border-t border-[#383838]">
                      <span className="text-[10px] text-[#9B9B9B]">MBTI</span>
                      <span className="text-[10px] text-[#E8E8E8] font-medium tracking-wide">{personality.mbti}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── Right panel ── */}
        <div className={`flex-1 min-h-0 min-w-0 ${tab === 'curves' ? 'overflow-hidden' : 'overflow-y-auto'}`}>

          {tab === 'status' && (
            <div className="grid grid-cols-2 gap-4 h-full">
              {[
                { label: 'Relationships' },
                { label: 'Recent Memories' },
              ].map(({ label }) => (
                <div key={label} className="flex flex-col min-h-0">
                  <p className="text-[10px] font-medium tracking-widest uppercase text-[#6B6B6B] mb-2">
                    {label}
                  </p>
                  <div className="flex-1 bg-[#252525] border border-[#383838] rounded flex items-center justify-center">
                    <p className="text-sm text-[#4A4A4A]">No data yet</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'curves' && (
            <NeedsCurvesPanel
              needs={NEEDS}
              needsConfig={needsConfig as Record<string, NeedConfig>}
              slug={slug}
            />
          )}

        </div>
      </div>
    </div>
  )
}
