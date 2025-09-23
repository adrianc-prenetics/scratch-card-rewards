import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './index.css'
import Scratch from '@kiefer/scratch'
import confetti from 'canvas-confetti'
import { z } from 'zod'

function GradientLogoBar() {
  return (
    <div className="w-full max-w-xl mx-auto grid grid-cols-2 gap-3 px-4">
      <div className="glass rounded-xl py-2 md:py-3 flex items-center justify-center">
        <img src="/images/token-2049-logo.png" alt="TOKEN 2049 logo" className="h-6 md:h-7 object-contain" />
      </div>
      <div className="glass rounded-xl py-2 md:py-3 flex items-center justify-center">
        <img src="/images/im8-logo.svg" alt="IM8 logo" className="h-6 md:h-7 object-contain" />
      </div>
    </div>
  )
}

function EntryForm({ onVerify }) {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl space-y-8">
        <GradientLogoBar />
      <div className="glass rounded-2xl p-6 md:p-10">
          <div className="space-y-3 text-center">
            <h1 className="headline text-brand-dark">Scratch, Sip, and Win</h1>
            <div className="flex items-center justify-center">
              <span className="hashtag">#FueltheChain</span>
            </div>
          </div>
          <p className="text-center text-sm md:text-base subhead desc-cta mt-6">
            Follow @IM8health on X to win a guaranteed prize
          </p>
          <div className="mt-8 space-y-4">
            <button className="btn-primary btn-premium w-full" onClick={onVerify}>ENTER NOW</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ScratchCard({ prize, onFullyRevealed }) {
  const frameRef = useRef(null)
  const [dim, setDim] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      const h = Math.round(w * 0.52)
      if (w !== dim.width || h !== dim.height) setDim({ width: w, height: h })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const coverData = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = dim.width
    c.height = dim.height
    const ctx = c.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, dim.width, dim.height)
    g.addColorStop(0, '#A40011')
    g.addColorStop(1, '#50000B')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, dim.width, dim.height)
    return c.toDataURL()
  }, [dim.width, dim.height])

  return (
    <div className="w-full flex items-center justify-center">
      <div ref={frameRef} className="prize-frame w-full max-w-[36rem]">
        <div className="prize-overlay">
          <div className="relative z-[1] px-8 text-center">
            <div className="text-3xl md:text-4xl font-semibold leading-snug text-brand-dark">{prize}</div>
          </div>
          {dim.width > 0 && (
            <Scratch
              key={`${dim.width}x${dim.height}`}
              id="scratch-card"
              width={dim.width}
              height={dim.height}
              cover={coverData}
              finishTransition={true}
              threshold={0.55}
              fadeDuration={0.6}
              scratchRadius={20}
              style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', width: '100%', height: '100%', zIndex: 2 }}
              onFinish={() => {
                confetti({ spread: 70, particleCount: 160, origin: { y: 0.25 } })
                onFullyRevealed?.()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Congrats({ prize, onShare }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl space-y-8">
        <GradientLogoBar />
        <div className="glass rounded-2xl p-6 md:p-10">
          <h2 className="headline text-center text-brand-dark">Congratulations!</h2>
          <div className="flex items-center justify-center mt-4">
            <span className="hashtag">#FueltheChain</span>
          </div>
          <p className="subhead text-center mt-4">Scratch to reveal your prize</p>
          <div className="mt-6">
            <ScratchCard prize={prize} onFullyRevealed={() => setRevealed(true)} />
          </div>
          <div className="text-center text-sm md:text-base mt-8 space-y-2" style={{color:'#50000B', fontWeight:400}}>
            <p>Show this screen to staff at the IM8 booth to claim your prize.</p>
            <p>Share a Tweet for bonus prize! <span className="font-semibold">#FueltheChain</span></p>
          </div>
          <div className="mt-6 flex items-center justify-center">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('I just won at #FueltheChain! 🎉')}`}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              onClick={onShare}
            >
              Share on X
            </a>
          </div>
          {!revealed && (
            <p className="text-center text-xs mt-4 text-white/60">Scratch to reveal your prize</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [verified, setVerified] = useState(false)
  // Final fallback only: if logic fails, show baseline label
  const [prize, setPrize] = useState('10% off first order')
  const apiBase = import.meta.env.VITE_API_BASE_URL || ''

  if (!verified) {
    return <EntryForm onVerify={async () => {
      try {
        // Placeholder: open X follow intent in a new window.
        const handle = 'IM8health'
        const win = window.open(`https://twitter.com/intent/follow?screen_name=${handle}`, '_blank', 'noopener,noreferrer')
        // In a real flow, you would verify via backend OAuth; here we trust user action.
      } catch {}
      try {
        const res = await fetch(`${apiBase}/api/draw`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        const data = await res.json()
        setPrize(data?.prize?.name || 'Premium Cold Brew Token')
      } catch {}
      setVerified(true)
    }} />
  }
  return <Congrats prize={prize} onShare={() => {}} />
}

