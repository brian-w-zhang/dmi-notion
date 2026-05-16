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
      <div className="max-w-xl mx-auto px-6 py-8">
        <Link
          href="/dashboard"
          className="text-gray-500 hover:text-gray-300 transition-colors mb-8 inline-block"
          style={{ fontFamily: 'var(--font-vt323)', fontSize: '18px' }}
        >
          ← All characters
        </Link>

        {/* Header */}
        <div className="flex items-start gap-6 mb-10 mt-4">
          <div className="shrink-0 bg-gray-900 border border-gray-800 rounded-lg p-4">
            <CharacterSprite spritePath={character.spritePath} scale={5} />
          </div>
          <div className="pt-2">
            <h1
              className="text-white leading-relaxed"
              style={{ fontFamily: 'var(--font-press-start)', fontSize: '10px' }}
            >
              {character.displayName}
            </h1>
            <p
              className="text-gray-500 mt-2"
              style={{ fontFamily: 'var(--font-vt323)', fontSize: '18px' }}
            >
              {character.isPlayerControlled ? 'Player controlled' : 'Agent'}
            </p>
          </div>
        </div>

        {/* Needs */}
        <section className="mb-8">
          <h2
            className="text-gray-500 mb-3"
            style={{ fontFamily: 'var(--font-press-start)', fontSize: '8px', letterSpacing: '0.1em' }}
          >
            Needs
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800/60">
            {NEEDS.map((need) => (
              <div key={need.name} className="px-4 py-3 flex items-center gap-4">
                <span
                  className="text-gray-300 w-24 shrink-0"
                  style={{ fontFamily: 'var(--font-vt323)', fontSize: '18px' }}
                >
                  {need.name}
                </span>
                <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                  <div
                    className={`${need.color} h-1.5 rounded-full opacity-70`}
                    style={{ width: `${need.value}%` }}
                  />
                </div>
                <span
                  className="text-gray-600 w-7 text-right tabular-nums"
                  style={{ fontFamily: 'var(--font-vt323)', fontSize: '16px' }}
                >
                  {need.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Relationships */}
        <section className="mb-8">
          <h2
            className="text-gray-500 mb-3"
            style={{ fontFamily: 'var(--font-press-start)', fontSize: '8px', letterSpacing: '0.1em' }}
          >
            Relationships
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-10 text-center">
            <p style={{ fontFamily: 'var(--font-vt323)', fontSize: '18px' }} className="text-gray-700">
              No relationship data yet
            </p>
          </div>
        </section>

        {/* Memories */}
        <section>
          <h2
            className="text-gray-500 mb-3"
            style={{ fontFamily: 'var(--font-press-start)', fontSize: '8px', letterSpacing: '0.1em' }}
          >
            Recent Memories
          </h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-10 text-center">
            <p style={{ fontFamily: 'var(--font-vt323)', fontSize: '18px' }} className="text-gray-700">
              No memory data yet
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
