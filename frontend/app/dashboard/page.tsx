import Link from 'next/link'
import { CHARACTER_ASSETS } from '../../game/config/characters'
import CharacterCard from '../../components/CharacterCard'

export default function DashboardPage() {
  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Characters</h1>
            <p className="text-gray-500 text-sm mt-0.5">Dunder Mifflin, Scranton</p>
          </div>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Simulation
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {CHARACTER_ASSETS.map((character) => (
            <CharacterCard key={character.owner} character={character} />
          ))}
        </div>
      </div>
    </div>
  )
}
