"use client"

import { useEffect, useState } from "react"
import { WebGPUScene } from "@/components/webgpu/webgpu-scene"
import {
  PALETTE,
  TUTORIAL_TEXT,
} from "@/components/tutorial/config"
import { Step1Text } from "@/components/tutorial/steps/step-1-text"
import { Step2TrailField } from "@/components/tutorial/steps/step-2-trail-field"
import { Step3Warp } from "@/components/tutorial/steps/step-3-warp"
import { Step4Blur } from "@/components/tutorial/steps/step-4-blur"
import { Step5BrushShapes } from "@/components/tutorial/steps/step-5-brush-shapes"
import { Step6FlowModes } from "@/components/tutorial/steps/step-6-flow-modes"
import { Step7Ink } from "@/components/tutorial/steps/step-7-ink"
import { Step8SpeedColor } from "@/components/tutorial/steps/step-8-speed-color"
import { Step9MaskToText } from "@/components/tutorial/steps/step-9-mask-to-text"
import { cn } from "@/lib/cn"
import { BRUSH_NAMES, type BrushName } from "@/lib/tsl/tutorial/brushes"
import type { FlowMode } from "@/lib/tsl/tutorial/use-trail-field"

const FLOW_MODES: FlowMode[] = ["velocity", "radial", "tangent"]

/**
 * The background is a picker now, so the bare-text chrome can't assume dark ink
 * on light paper. Relative luminance decides which way the captions flip.
 */
const isDarkPaper = (hex: string) => {
  const v = hex.startsWith("#") ? hex.slice(1) : hex
  const r = Number.parseInt(v.slice(0, 2), 16) / 255
  const g = Number.parseInt(v.slice(2, 4), 16) / 255
  const b = Number.parseInt(v.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5
}

const STEPS = [
  {
    title: "1 · The trail field, raw",
    caption:
      "The cursor writes a 200×200 float texture. R/G hold flow. B holds speed. It all decays. This is that texture, drawn raw.",
  },
  {
    title: "2 · A word on screen",
    caption:
      "Text goes to a 2D canvas, then to a texture. Its luminance picks paper or ink. Nothing to distort it with yet.",
  },
  {
    title: "3 · Warp the text",
    caption:
      "Sample the text at uv() + flow instead of uv(). One line, and that is the whole warp. It stair-steps, because the field is NearestFilter.",
  },
  {
    title: "4 · Blur the read, not the field",
    caption:
      "A 9-tap Gaussian at the read. The field stays sharp, so the brush pattern survives. The kernel stays yours.",
  },
  {
    title: "5 · The brush is a function",
    caption:
      "The shader did not change. Only the BrushFn did. force = envelope × pattern × scale. Only pattern varies.",
  },
  {
    title: "6 · Which way the flow points",
    caption:
      "The brush picks the shape. The flow mode picks the direction. Six lines, three interactions that feel nothing alike.",
  },
  {
    title: "7 · Fill the letters with ink",
    caption:
      "Simplex noise modulates the ink. Sample it at the warped uv and the grain rides the letters. Sample at uv() and it reads as a filter.",
  },
  {
    title: "8 · One field, a second job",
    caption:
      "B has held speed this whole time. Read it and a colour ramp falls out. Slow strokes stay ink. Fast ones flash cream.",
  },
  {
    title: "9 · Mask it to the letters",
    caption:
      "mix(1, textMask, filterToText). Drag the background, nothing. Cross a letter, it lights up. The type stops being a backdrop.",
  },
] as const

export default function ShaderTrailTutorialExperience() {
  const [step, setStep] = useState(0)
  const [brush, setBrush] = useState<BrushName>("crossSquareCorner")
  const [flowMode, setFlowMode] = useState<FlowMode>("velocity")
  const [blur, setBlur] = useState(true)
  const [maskToText, setMaskToText] = useState(true)
  const [inkNoise, setInkNoise] = useState(true)
  const [text, setText] = useState(TUTORIAL_TEXT)
  const [ink, setInk] = useState<string>(PALETTE.ink)
  const [paper, setPaper] = useState<string>(PALETTE.paper)
  /** Press H to strip every overlay — for clean screen recordings. */
  const [chromeHidden, setChromeHidden] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === "INPUT") return
      if (event.key === "h" || event.key === "H") {
        setChromeHidden((v) => !v)
        return
      }
      if (event.key === "ArrowRight") {
        setStep((s) => Math.min(STEPS.length - 1, s + 1))
      }
      if (event.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const current = STEPS[step]!
  const darkPaper = isDarkPaper(paper)

  return (
    <main
      className="relative h-dvh w-screen overflow-hidden"
      style={{ backgroundColor: paper }}
    >
      {/* The word is real DOM for assistive tech — the canvas only has pixels. */}
      <h1 className="sr-only">{text}</h1>

      <div aria-hidden="true" className="absolute inset-0">
        <WebGPUScene>
          {step === 0 && <Step2TrailField />}
          {step === 1 && <Step1Text ink={ink} paper={paper} text={text} />}
          {step === 2 && <Step3Warp ink={ink} paper={paper} text={text} />}
          {step === 3 && (
            <Step4Blur blur={blur} ink={ink} paper={paper} text={text} />
          )}
          {step === 4 && (
            <Step5BrushShapes
              brush={brush}
              ink={ink}
              paper={paper}
              text={text}
            />
          )}
          {step === 5 && (
            <Step6FlowModes
              brush={brush}
              flowMode={flowMode}
              ink={ink}
              paper={paper}
              text={text}
            />
          )}
          {step === 6 && (
            <Step7Ink
              brush={brush}
              ink={ink}
              noiseEnabled={inkNoise}
              paper={paper}
              text={text}
            />
          )}
          {step === 7 && (
            <Step8SpeedColor
              brush={brush}
              ink={ink}
              paper={paper}
              text={text}
            />
          )}
          {step === 8 && (
            <Step9MaskToText
              brush={brush}
              flowMode={flowMode}
              ink={ink}
              maskToText={maskToText}
              paper={paper}
              text={text}
            />
          )}
        </WebGPUScene>
      </div>

      {chromeHidden ? null : (
        <>
          <div
            className={cn(
              "pointer-events-none fixed top-6 left-6 max-w-md font-mono",
              darkPaper ? "text-white/80" : "text-black/80"
            )}
          >
            <p className="text-[11px] uppercase tracking-[0.18em]">
              {current.title}
            </p>
            <p
              className={cn(
                "mt-2 text-xs leading-relaxed",
                darkPaper ? "text-white/60" : "text-black/60"
              )}
            >
              {current.caption}
            </p>
            <p
              className={cn(
                "mt-3 text-[10px] uppercase tracking-[0.18em]",
                darkPaper ? "text-white/40" : "text-black/30"
              )}
            >
              ← → step · H hide ui
            </p>
          </div>

          {/* Step 4: blur on/off. */}
          {step === 3 && (
            <Toggles
              options={["blurred", "raw"]}
              active={blur ? "blurred" : "raw"}
              onSelect={(v) => setBlur(v === "blurred")}
            />
          )}

          {/* Steps 5–9: the brush picker — the demo's main argument. */}
          {step >= 4 && (
            <Toggles
              options={BRUSH_NAMES}
              active={brush}
              onSelect={(v) => setBrush(v as BrushName)}
            />
          )}

          {/* Steps 6 & 9: the second axis. */}
          {(step === 5 || step === 8) && (
            <Toggles
              className="top-20"
              options={FLOW_MODES}
              active={flowMode}
              onSelect={(v) => setFlowMode(v as FlowMode)}
            />
          )}

          {/* Step 7: noise on/off, so the "shadow" is explainable. */}
          {step === 6 && (
            <Toggles
              className="top-20"
              active={inkNoise ? "noise" : "flat ink"}
              onSelect={(v) => setInkNoise(v === "noise")}
              options={["noise", "flat ink"]}
            />
          )}

          {/* Step 9: the one line the step is about. */}
          {step === 8 && (
            <Toggles
              className="top-34"
              options={["masked", "everywhere"]}
              active={maskToText ? "masked" : "everywhere"}
              onSelect={(v) => setMaskToText(v === "masked")}
            />
          )}

          <div className="fixed right-6 bottom-6 flex items-center gap-2">
            <ColorPicker label="Text colour" onChange={setInk} value={ink} />
            <ColorPicker
              label="Background colour"
              onChange={setPaper}
              value={paper}
            />
            <input
              aria-label="Text to render"
              className="w-40 rounded-full border border-black/20 bg-white/70 px-4 py-2 font-mono text-[11px] text-black/70 uppercase tracking-[0.1em] outline-none backdrop-blur focus-visible:ring-2 focus-visible:ring-black/40"
              onChange={(event) => setText(event.target.value)}
              value={text}
            />
          </div>

          <nav className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2">
            <button
              className="rounded-full border border-black/20 bg-white/70 px-4 py-2 font-mono text-[11px] text-black/70 uppercase tracking-[0.18em] backdrop-blur transition-colors hover:bg-white hover:text-black disabled:opacity-30"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              type="button"
            >
              ← Prev
            </button>
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums tracking-[0.18em]",
                darkPaper ? "text-white/60" : "text-black/50"
              )}
            >
              {step + 1} / {STEPS.length}
            </span>
            <button
              className="rounded-full border border-black/20 bg-white/70 px-4 py-2 font-mono text-[11px] text-black/70 uppercase tracking-[0.18em] backdrop-blur transition-colors hover:bg-white hover:text-black disabled:opacity-30"
              disabled={step === STEPS.length - 1}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              type="button"
            >
              Next →
            </button>
          </nav>
        </>
      )}
    </main>
  )
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <input
      aria-label={label}
      className="size-11 cursor-pointer rounded-full border border-black/20 bg-white/70 p-1 backdrop-blur focus-visible:ring-2 focus-visible:ring-black/40"
      onChange={(event) => onChange(event.target.value)}
      title={label}
      type="color"
      value={value}
    />
  )
}

function Toggles({
  options,
  active,
  onSelect,
  className,
}: {
  options: readonly string[]
  active: string
  onSelect: (value: string) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "fixed top-6 left-1/2 flex -translate-x-1/2 gap-2",
        className
      )}
    >
      {options.map((option) => (
        <button
          className={cn(
            "rounded-full border border-black/20 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] backdrop-blur transition-colors",
            active === option
              ? "bg-black text-white"
              : "bg-white/70 text-black/70 hover:bg-white"
          )}
          key={option}
          onClick={() => onSelect(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  )
}
