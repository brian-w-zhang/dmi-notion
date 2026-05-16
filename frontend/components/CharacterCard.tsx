'use client'
import Link from 'next/link'
import CharacterSprite from './CharacterSprite'
import type { CharacterAssetDef } from '../game/config/characters'

const ROLES: Record<string, string> = {
  michael:  'Regional Manager',
  dwight:   'Sales',
  jim:      'Sales',
  pam:      'Receptionist',
  ryan:     'Temp',
  kelly:    'Customer Service',
  angela:   'Accounting',
  oscar:    'Accounting',
  kevin:    'Accounting',
  stanley:  'Sales',
  phyllis:  'Sales',
  meredith: 'Supplier Relations',
  creed:    'Quality Assurance',
  toby:     'Human Resources',
}

export default function CharacterCard({ character }: { character: CharacterAssetDef }) {
  const role = ROLES[character.owner]

  return (
    <Link
      href={`/dashboard/${character.owner}`}
      className="w-[10.5rem] flex flex-col items-center gap-2 pt-4 pb-4 px-3 bg-[#252525]/60 backdrop-blur-md border border-[#383838]/70 rounded-2xl cursor-pointer hover:bg-[#2D2D2D]/70 hover:border-[#E8E8E8]/40 hover:shadow-[0_0_12px_rgba(255,255,255,0.08)] transition-all"
    >
      <CharacterSprite spritePath={character.spritePath} scale={3} />
      <div className="flex flex-col items-center gap-0.5 w-full">
        <span className="text-[#E8E8E8] text-center text-base font-semibold leading-tight w-full truncate">
          {character.displayName}
        </span>
        {role && (
          <span className="text-[#9B9B9B] text-center text-[12px] leading-tight w-full truncate">
            {role}
          </span>
        )}
      </div>
    </Link>
  )
}
