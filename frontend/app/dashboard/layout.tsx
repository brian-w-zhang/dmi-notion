import { Press_Start_2P, VT323, Inter } from 'next/font/google'

const pressStart = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start',
  display: 'swap',
})

const vt323 = VT323({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-vt323',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${pressStart.variable} ${vt323.variable} ${inter.className} h-full`}>
      {children}
    </div>
  )
}
