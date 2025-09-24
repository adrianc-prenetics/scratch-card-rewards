import { useEffect, useMemo, useRef, useState } from 'react'
import './index.css'
import Scratch from '@kiefer/scratch'
import confetti from 'canvas-confetti'
import { z } from 'zod'

const SCRATCH_COVER_SRC = '/images/Scratch-card.png'
const SCRATCH_ASPECT_RATIO = 1028 / 1976

function createGradientCover(width, height) {
  if (!width || !height) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#A40011')
  gradient.addColorStop(1, '#50000B')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  return canvas.toDataURL()
}

function createImageCover(img, width, height) {
  if (!img || !width || !height) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height
  if (!naturalWidth || !naturalHeight) return null

  const scale = Math.max(width / naturalWidth, height / naturalHeight)
  const drawWidth = naturalWidth * scale
  const drawHeight = naturalHeight * scale
  const offsetX = (width - drawWidth) / 2
  const offsetY = (height - drawHeight) / 2

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
  return canvas.toDataURL()
}

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
            Follow <span className="font-semibold">@IM8health</span> on X to win a guaranteed prize
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
  const [coverData, setCoverData] = useState(null)

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      const h = Math.round(w * SCRATCH_ASPECT_RATIO)
      if (w !== dim.width || h !== dim.height) setDim({ width: w, height: h })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fallbackCover = useMemo(() => createGradientCover(dim.width, dim.height), [dim.width, dim.height])

  useEffect(() => {
    if (!dim.width || !dim.height) {
      setCoverData(null)
      return
    }

    let cancelled = false

    const img = new Image()
    img.src = SCRATCH_COVER_SRC

    const handleLoad = () => {
      if (cancelled) return
      const cover = createImageCover(img, dim.width, dim.height)
      setCoverData(cover || fallbackCover)
    }

    const handleError = () => {
      if (cancelled) return
      setCoverData(fallbackCover)
    }

    if (img.complete && img.naturalWidth) {
      handleLoad()
    } else {
      img.onload = handleLoad
      img.onerror = handleError
    }

    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
    }
  }, [dim.width, dim.height, fallbackCover])

  return (
    <div className="w-full flex items-center justify-center">
      <div ref={frameRef} className="prize-frame w-full max-w-[36rem]">
        <div className="prize-overlay">
          <div className="relative z-[1] px-8 text-center">
            <div className="text-3xl md:text-4xl font-semibold leading-snug text-brand-dark">{prize}</div>
          </div>
          {dim.width > 0 && coverData && (
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

