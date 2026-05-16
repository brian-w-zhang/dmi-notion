'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import CharacterSprite from './CharacterSprite'
import type { CharacterAssetDef } from '../game/config/characters'

const DROPDOWN_ITEMS = ['Edit Needs', 'Relationships', 'Notes']

export default function CharacterCard({ character }: { character: CharacterAssetDef }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }, [])

  useEffect(() => {
    if (open) document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open, handleOutsideClick])

  return (
    <div className="relative bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-600 transition-colors">
      {/* Settings */}
      <div ref={ref} className="absolute top-2 right-2 z-10">
        <button
          onClick={(e) => { e.preventDefault(); setOpen((v) => !v) }}
          className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-gray-200 transition-colors text-sm"
          aria-label="Settings"
        >
          ⚙
        </button>
        {open && (
          <div className="absolute right-0 top-8 w-40 bg-gray-800 border border-gray-700 rounded shadow-xl z-20 py-1">
            {DROPDOWN_ITEMS.map((label) => (
              <button
                key={label}
                onClick={() => setOpen(false)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Card body links to detail page */}
      <Link href={`/dashboard/${character.owner}`} className="block p-4 text-center">
        <div className="flex justify-center mb-3 mt-1">
          <CharacterSprite spritePath={character.spritePath} scale={3} />
        </div>
        <p className="text-white text-sm font-medium tracking-wide leading-tight">
          {character.displayName}
        </p>
        {character.isPlayerControlled && (
          <p className="mt-1 text-xs text-yellow-500/60">player</p>
        )}
      </Link>
    </div>
  )
}
