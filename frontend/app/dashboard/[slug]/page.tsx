'use client'
import { use } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CHARACTER_ASSETS } from '../../../game/config/characters'
import CharacterSprite from '../../../components/CharacterSprite'

const NEEDS = [
  { name: 'Hunger',      color: 'bg-orange-500', value: 65 },
  { name: 'Social',      color: 'bg-blue-500',   value: 80 },
  { name: 'Stimulation', color: 'bg-purple-500', value: 45 },
  { name: 'Belonging',   color: 'bg-pink-500',   value: 72 },
  { name: 'Esteem',      color: 'bg-yellow-500', value: 58 },
  { name: 'Autonomy',    color: 'bg-green-500',  value: 40 },
]

export default function CharacterDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const character = CHARACTER_ASSETS.find((c) => c.owner === slug)
  if (!character) notFound()

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-8 inline-block"
        >
          ← All characters
        </Link>

        {/* Header */}
        <div className="flex items-start gap-6 mb-10 mt-4">
          <div className="shrink-0 bg-gray-900 border border-gray-800 rounded-lg p-4">
            <CharacterSprite spritePath={character.spritePath} scale={5} />
          </div>
          <div className="pt-1">
            <h1 className="text-2xl font-semibold">{character.displayName}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {character.isPlayerControlled ? 'Player controlled' : 'Agent'}
            </p>
            <span className="mt-4 inline-block px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-400">
              {character.owner}
            </span>
          </div>
        </div>

        {/* Needs */}
        <section className="mb-8">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">
            Needs
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800/60">
            {NEEDS.map((need) => (
              <div key={need.name} className="px-4 py-3 flex items-center gap-4">
                <span className="text-sm text-gray-300 w-24 shrink-0">{need.name}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                  <div
                    className={`${need.color} h-1.5 rounded-full opacity-70`}
                    style={{ width: `${need.value}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600 w-7 text-right tabular-nums">{need.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Relationships */}
        <section className="mb-8">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">
            Relationships
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-10 text-center">
            <p className="text-gray-700 text-sm">No relationship data yet</p>
          </div>
        </section>

        {/* Memories */}
        <section>
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-3">
            Recent Memories
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-10 text-center">
            <p className="text-gray-700 text-sm">No memory data yet</p>
          </div>
        </section>
      </div>
    </div>
  )
}
