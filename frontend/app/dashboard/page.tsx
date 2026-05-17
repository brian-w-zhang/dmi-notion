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
        <div className="shrink-0 flex items-center justify-between mb-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-[#E8E8E8] hover:text-white transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Back
          </Link>
          <span className="text-[10px] font-medium tracking-widest uppercase text-[#E8E8E8]">
            Characters
          </span>
        </div>

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
