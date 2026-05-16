import Link from 'next/link'
import { CHARACTER_ASSETS } from '../../game/config/characters'
import CharacterCard from '../../components/CharacterCard'

export default function DashboardPage() {
  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1
            className="text-white"
            style={{ fontFamily: 'var(--font-press-start)', fontSize: '10px', lineHeight: 1.6 }}
          >
            Characters
          </h1>
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-300 transition-colors"
            style={{ fontFamily: 'var(--font-vt323)', fontSize: '18px' }}
          >
            ← Simulation
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-3">
          {CHARACTER_ASSETS.map((character) => (
            <CharacterCard key={character.owner} character={character} />
          ))}
        </div>
      </div>
    </div>
  )
}
