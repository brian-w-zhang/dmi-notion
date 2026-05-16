import Link from 'next/link'
import { CHARACTER_ASSETS } from '../../game/config/characters'
import CharacterCard from '../../components/CharacterCard'

export default function DashboardPage() {
  return (
    <div className="h-full flex flex-col bg-[#191919] text-[#E8E8E8] px-6 py-5">
      <Link
        href="/"
        className="text-[#9B9B9B] hover:text-[#E8E8E8] transition-colors mb-6 self-start text-sm"
      >
        ← Simulation
      </Link>

      <p className="text-xs font-medium tracking-widest uppercase text-[#6B6B6B] mb-4">
        Characters
      </p>

      <div className="flex-1 grid grid-cols-7 gap-2.5 content-start">
        {CHARACTER_ASSETS.map((character) => (
          <CharacterCard key={character.owner} character={character} />
        ))}
      </div>
    </div>
  )
}
