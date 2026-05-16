'use client'
import { useEffect, useRef } from 'react'

// Frame 74 is the first frame of the front-facing idle-full animation
const FRONT_IDLE_FRAME = 74
const SHEET_COLS = 56
const FRAME_W = 32
const FRAME_H = 64
const SRC_X = (FRONT_IDLE_FRAME % SHEET_COLS) * FRAME_W // 576
const SRC_Y = Math.floor(FRONT_IDLE_FRAME / SHEET_COLS) * FRAME_H // 64

interface CharacterSpriteProps {
  spritePath: string
  scale?: number
  className?: string
}

export default function CharacterSprite({ spritePath, scale = 3, className }: CharacterSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.src = spritePath
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, SRC_X, SRC_Y, FRAME_W, FRAME_H, 0, 0, canvas.width, canvas.height)
    }
  }, [spritePath])

  return (
    <canvas
      ref={canvasRef}
      width={FRAME_W * scale}
      height={FRAME_H * scale}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
