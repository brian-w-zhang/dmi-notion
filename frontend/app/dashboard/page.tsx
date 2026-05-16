import Link from 'next/link'
import { CHARACTER_ASSETS } from '../../game/config/characters'
import CharacterCard from '../../components/CharacterCard'

export default function DashboardPage() {
  return (
    <div className="h-full relative overflow-hidden text-[#E8E8E8]">
      {/* Background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/pam-art.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/72" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col px-6 py-5">
        <Link
          href="/"
          className="text-[#9B9B9B] hover:text-[#E8E8E8] transition-colors mb-6 self-start text-sm shrink-0"
        >
          ← Simulation
        </Link>

        <div className="flex-1 flex items-center justify-center">
          <div className="grid grid-cols-7 gap-2.5">
            {CHARACTER_ASSETS.map((character) => (
              <CharacterCard key={character.owner} character={character} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
