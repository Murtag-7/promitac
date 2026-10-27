import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { OutputFrame } from '@core/live/frame'
import type { Slide, SlideVerse } from '@core/slides/model'
import { fitFontSize } from '@core/slides/fit'
import { CANVAS, FONTS, type Theme, type ThemeBackground } from '@core/theme/model'
import { cn } from '@/lib/cn'
import './fonts.css'

export type ProjectionMode = 'output' | 'preview'

/**
 * Renders an output frame on a virtual 1920×1080 canvas scaled into its container, so the
 * control-window previews are pixel-identical to the projector output.
 */
export function ProjectionView({
  frame,
  mode,
  className,
  label
}: {
  frame: OutputFrame | null
  mode: ProjectionMode
  className?: string
  label?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const update = (): void => setBox({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = box.w && box.h ? Math.min(box.w / CANVAS.width, box.h / CANVAS.height) : 0
  const offsetX = (box.w - CANVAS.width * scale) / 2
  const offsetY = (box.h - CANVAS.height * scale) / 2

  return (
    <div
      ref={hostRef}
      className={cn(
        'projection relative overflow-hidden bg-black',
        mode === 'preview' && 'pointer-events-none',
        className
      )}
      role={mode === 'preview' ? 'img' : undefined}
      aria-label={label}
      data-overlay={frame?.overlay ?? 'none'}
      data-slide-id={frame?.slide?.id ?? ''}
    >
      {scale > 0 && frame ? (
        <div
          className="absolute origin-top-left"
          style={{
            width: CANVAS.width,
            height: CANVAS.height,
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
          }}
        >
          <Stage frame={frame} mode={mode} />
        </div>
      ) : null}
    </div>
  )
}

function Stage({ frame, mode }: { frame: OutputFrame; mode: ProjectionMode }) {
  const { theme, overlay, slide } = frame
  const fade = theme.transition.kind === 'fade' ? theme.transition.durationMs : 0
  const showContent = overlay === 'none' && !frame.timer
  const isMediaSlide = slide?.kind === 'media'
  const background: ThemeBackground | null = isMediaSlide
    ? null
    : (frame.backgroundOverride ?? theme.background)

  return (
    <>
      <Crossfade itemKey={bgKey(background)} duration={fade}>
        {background ? <BackgroundLayer bg={background} theme={theme} frame={frame} mode={mode} /> : null}
      </Crossfade>

      <Crossfade
        itemKey={
          showContent && slide ? `${slide.id}|${slide.lines.join('\n')}|${slide.mediaId ?? ''}` : 'none'
        }
        duration={fade}
      >
        {showContent && slide ? <SlideContent slide={slide} theme={theme} frame={frame} mode={mode} /> : null}
      </Crossfade>

      <Crossfade itemKey={overlay === 'logo' ? `logo|${frame.logoMediaId ?? ''}` : 'none'} duration={fade}>
        {overlay === 'logo' ? <LogoLayer frame={frame} mode={mode} /> : null}
      </Crossfade>

      {frame.timer && overlay !== 'black' ? <TimerLayer timer={frame.timer} theme={theme} /> : null}

      <AlertBand text={overlay === 'black' ? null : (frame.alert?.text ?? null)} theme={theme} />

      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: overlay === 'black' ? 1 : 0, transition: `opacity ${Math.max(fade, 120)}ms ease` }}
      />

      {frame.identify ? <IdentifyLayer label={frame.identify.label} /> : null}
    </>
  )
}

function bgKey(bg: ThemeBackground | null): string {
  if (!bg) return 'none'
  if (bg.kind === 'color') return `c|${bg.color}`
  if (bg.kind === 'gradient') return `g|${bg.from}|${bg.to}|${bg.angle}`
  return `m|${bg.mediaId}`
}

/** Keeps the previous child while the next one fades in (interruptible, CSS transitions only). */
function Crossfade({
  itemKey,
  duration,
  children
}: {
  itemKey: string
  duration: number
  children: React.ReactNode
}) {
  const [layers, setLayers] = useState<Array<{ key: string; node: React.ReactNode; visible: boolean }>>(
    () => [{ key: itemKey, node: children, visible: true }]
  )
  const latest = useRef({ itemKey, children })
  latest.current = { itemKey, children }

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1]
      if (top && top.key === itemKey) {
        return prev.map((l, i) => (i === prev.length - 1 ? { ...l, node: latest.current.children } : l))
      }
      if (duration <= 0) return [{ key: itemKey, node: latest.current.children, visible: true }]
      return [
        ...prev.map((l) => ({ ...l, visible: false })),
        { key: itemKey, node: latest.current.children, visible: false }
      ]
    })
    if (duration <= 0) return
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setLayers((prev) => prev.map((l) => (l.key === itemKey ? { ...l, visible: true } : l)))
      )
    )
    const t = window.setTimeout(
      () => setLayers((prev) => prev.filter((l) => l.key === itemKey)),
      duration + 60
    )
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [itemKey, duration])

  // Keep the current layer's content fresh (e.g. a timer label) without re-triggering the fade.
  const rendered = layers.map((l, i) =>
    i === layers.length - 1 && l.key === itemKey ? { ...l, node: children } : l
  )

  return (
    <>
      {rendered.map((l) => (
        <div
          key={l.key}
          className="absolute inset-0"
          style={{
            opacity: l.visible ? 1 : 0,
            transition: duration > 0 ? `opacity ${duration}ms ease` : undefined
          }}
        >
          {l.node}
        </div>
      ))}
    </>
  )
}

function MediaElement({
  url,
  kind,
  fit,
  mode,
  loop,
  withSound
}: {
  url: string
  kind: 'image' | 'video'
  fit: 'cover' | 'contain'
  mode: ProjectionMode
  loop: boolean
  withSound: boolean
}) {
  const style: React.CSSProperties = { width: '100%', height: '100%', objectFit: fit }
  if (kind === 'image') return <img src={url} alt="" draggable={false} style={style} />
  return (
    <video
      src={url}
      style={style}
      autoPlay
      loop={loop}
      // Previews in the control window never play sound.
      muted={!withSound || mode === 'preview'}
      playsInline
      disablePictureInPicture
    />
  )
}

function BackgroundLayer({
  bg,
  theme,
  frame,
  mode
}: {
  bg: ThemeBackground
  theme: Theme
  frame: OutputFrame
  mode: ProjectionMode
}) {
  if (bg.kind === 'color') return <div className="absolute inset-0" style={{ background: bg.color }} />
  if (bg.kind === 'gradient')
    return (
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})` }}
      />
    )
  const m = frame.media[bg.mediaId]
  return (
    <div className="absolute inset-0" style={{ background: bg.fallbackColor }}>
      {m ? <MediaElement url={m.url} kind={m.kind} fit="cover" mode={mode} loop withSound={false} /> : null}
      {theme.dim > 0 ? <div className="absolute inset-0 bg-black" style={{ opacity: theme.dim }} /> : null}
    </div>
  )
}

function LogoLayer({ frame, mode }: { frame: OutputFrame; mode: ProjectionMode }) {
  const m = frame.logoMediaId ? frame.media[frame.logoMediaId] : undefined
  if (!m) return null
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div style={{ width: '56%', height: '56%' }}>
        <MediaElement url={m.url} kind={m.kind} fit="contain" mode={mode} loop withSound={false} />
      </div>
    </div>
  )
}

let measureCtx: CanvasRenderingContext2D | null = null
function measure(lines: string[], font: string): number[] {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  const ctx = measureCtx
  if (!ctx) return lines.map((l) => l.length * 0.55)
  ctx.font = font
  return lines.map((l) => ctx.measureText(l).width / 100)
}

/** Re-render once the projection font is really loaded so measurements are correct. */
function useFontReady(font: string): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    if (!document.fonts.check(font)) {
      void document.fonts.load(font).then(() => alive && setTick((t) => t + 1))
    }
    return () => {
      alive = false
    }
  }, [font])
  return tick
}

function textShadow(theme: Theme, size: number): string | undefined {
  const s = theme.text.shadow
  if (s <= 0) return undefined
  return `0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.18)}px rgb(0 0 0 / ${0.75 * s}), 0 0 ${Math.round(size * 0.05)}px rgb(0 0 0 / ${0.5 * s})`
}

function SlideContent({
  slide,
  theme,
  frame,
  mode
}: {
  slide: Slide
  theme: Theme
  frame: OutputFrame
  mode: ProjectionMode
}) {
  if (slide.kind === 'media') {
    const m = slide.mediaId ? frame.media[slide.mediaId] : undefined
    return (
      <div className="absolute inset-0 bg-black">
        {m ? (
          <MediaElement url={m.url} kind={m.kind} fit="contain" mode={mode} loop={false} withSound />
        ) : null}
      </div>
    )
  }
  if (slide.kind === 'blank' || (slide.lines.length === 0 && !slide.title)) return null
  return <SlideText slide={slide} theme={theme} />
}

function SlideText({ slide, theme }: { slide: Slide; theme: Theme }) {
  const t = theme.text
  const family = FONTS[t.font]?.css ?? FONTS.inter.css
  const measureFont = `${t.weight} 100px ${family}`
  const fontTick = useFontReady(measureFont)
  const lines = useMemo(
    () => (t.uppercase ? slide.lines.map((l) => l.toLocaleUpperCase('cs')) : slide.lines),
    [slide.lines, t.uppercase]
  )
  const margin = theme.safeMargin / 100
  const showFooter = theme.footer.show && Boolean(slide.footer)
  const footerSpace = showFooter ? theme.footer.size * 2.2 : 0
  const titleScale = 0.58
  const availWidth = CANVAS.width * (1 - 2 * margin)
  const baseHeight = CANVAS.height * (1 - 2 * margin) - footerSpace

  const fit = useMemo(() => {
    const widths = measure(lines, measureFont)
    const titleSpace = slide.title ? t.maxSize * titleScale * 1.7 : 0
    return fitFontSize({
      lineWidthsAt1px: widths,
      lineHeight: t.lineHeight,
      availWidth,
      availHeight: baseHeight - titleSpace,
      min: t.autoFit ? t.minSize : t.maxSize,
      max: t.maxSize,
      paragraph: slide.kind === 'bible'
    })
    // fontTick: re-measure after the font has loaded
  }, [
    lines,
    measureFont,
    t.lineHeight,
    t.minSize,
    t.maxSize,
    t.autoFit,
    availWidth,
    baseHeight,
    slide.title,
    slide.kind,
    fontTick
  ])

  const justify = t.vAlign === 'top' ? 'flex-start' : t.vAlign === 'bottom' ? 'flex-end' : 'center'
  const common: React.CSSProperties = {
    fontFamily: family,
    fontWeight: t.weight,
    color: t.color,
    textAlign: t.align,
    textShadow: textShadow(theme, fit.size),
    WebkitTextStroke: t.outline > 0 ? `${t.outline}px ${t.outlineColor}` : undefined,
    paintOrder: 'stroke fill',
    fontOpticalSizing: 'auto'
  }

  return (
    <div
      className="absolute flex flex-col"
      style={{
        left: `${theme.safeMargin}%`,
        right: `${theme.safeMargin}%`,
        top: `${theme.safeMargin}%`,
        bottom: `${theme.safeMargin}%`,
        justifyContent: justify
      }}
    >
      {showFooter && theme.footer.position === 'top' ? (
        <Footer text={slide.footer ?? ''} theme={theme} />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col" style={{ justifyContent: justify }}>
        {slide.title ? (
          <div
            style={{
              ...common,
              fontSize: t.maxSize * titleScale,
              lineHeight: 1.2,
              fontWeight: Math.max(400, t.weight - 100),
              opacity: 0.78,
              marginBottom: t.maxSize * titleScale * 0.5,
              textWrap: 'balance'
            }}
          >
            {t.uppercase ? slide.title.toLocaleUpperCase('cs') : slide.title}
          </div>
        ) : null}
        <div style={{ ...common, fontSize: fit.size, lineHeight: t.lineHeight }} data-font-size={fit.size}>
          {slide.kind === 'bible' && slide.verses?.length ? (
            <div style={{ textWrap: 'pretty' }}>
              <BibleVerses verses={slide.verses} uppercase={t.uppercase} />
            </div>
          ) : (
            lines.map((line, i) => (
              <div
                key={i}
                style={{
                  whiteSpace: fit.wrap ? 'normal' : 'pre',
                  textWrap: fit.wrap ? 'balance' : undefined
                }}
              >
                {line || '\u00a0'}
              </div>
            ))
          )}
        </div>
      </div>
      {showFooter && theme.footer.position === 'bottom' ? (
        <Footer text={slide.footer ?? ''} theme={theme} />
      ) : null}
    </div>
  )
}

/** Verse numbers set small and raised, each kept on the same line as the first word of its verse. */
function BibleVerses({ verses, uppercase }: { verses: SlideVerse[]; uppercase: boolean }) {
  return verses.map((v, i) => {
    const text = uppercase ? v.text.toLocaleUpperCase('cs') : v.text
    const space = i > 0 ? ' ' : ''
    if (!v.number) return <span key={i}>{space + text}</span>
    const cut = text.search(/\s/u)
    const first = cut === -1 ? text : text.slice(0, cut)
    const rest = cut === -1 ? '' : text.slice(cut)
    return (
      <span key={i}>
        {space}
        <span style={{ whiteSpace: 'nowrap' }}>
          <span
            style={{
              fontSize: '0.56em',
              verticalAlign: '0.62em',
              opacity: 0.7,
              fontWeight: 600,
              lineHeight: 0
            }}
            data-verse-number
          >
            {v.number}
          </span>
          {'\u202f'}
          {first}
        </span>
        {rest}
      </span>
    )
  })
}

function Footer({ text, theme }: { text: string; theme: Theme }) {
  const t = theme.text
  return (
    <div
      style={{
        fontFamily: FONTS[t.font]?.css,
        fontSize: theme.footer.size,
        fontWeight: 500,
        color: t.color,
        opacity: 0.85,
        textAlign: t.align,
        lineHeight: 1.3,
        marginTop: theme.footer.position === 'bottom' ? theme.footer.size * 0.8 : 0,
        marginBottom: theme.footer.position === 'top' ? theme.footer.size * 0.8 : 0,
        textShadow: textShadow(theme, theme.footer.size * 1.5)
      }}
    >
      {text}
    </div>
  )
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function TimerLayer({ timer, theme }: { timer: { endsAt: number; label: string }; theme: Theme }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])
  const t = theme.text
  const style: React.CSSProperties = {
    fontFamily: FONTS[t.font]?.css,
    color: t.color,
    textShadow: textShadow(theme, 120)
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center" style={style}>
      {timer.label ? <div style={{ fontSize: 64, fontWeight: 500, opacity: 0.8 }}>{timer.label}</div> : null}
      <div style={{ fontSize: 260, fontWeight: 650, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
        {formatRemaining(timer.endsAt - now)}
      </div>
    </div>
  )
}

function AlertBand({ text, theme }: { text: string | null; theme: Theme }) {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    if (text) setShown(text)
  }, [text])
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex items-center justify-center"
      style={{
        padding: '28px 96px 34px',
        background: 'rgb(12 10 8 / 0.86)',
        transform: text ? 'translateY(0)' : 'translateY(105%)',
        transition: 'transform 360ms cubic-bezier(0.23, 1, 0.32, 1)'
      }}
      aria-hidden={!text}
    >
      <div
        style={{
          fontFamily: FONTS[theme.text.font]?.css,
          fontSize: 52,
          fontWeight: 600,
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.25,
          textWrap: 'balance'
        }}
      >
        {shown}
      </div>
    </div>
  )
}

function IdentifyLayer({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ border: '24px solid #f4ead9' }}
    >
      <div
        style={{
          fontFamily: FONTS.inter.css,
          fontSize: 120,
          fontWeight: 700,
          color: '#f4ead9',
          background: 'rgb(0 0 0 / 0.7)',
          padding: '24px 64px',
          borderRadius: 24
        }}
      >
        {label}
      </div>
    </div>
  )
}
