"use client"

import dynamic from "next/dynamic"
import { OverlayLinks } from "@/components/ui/overlay-links"
import { PAPER } from "@/lib/palette"

const ShaderTrailExperience = dynamic(
  () => import("@/components/shader-trail/shader-trail-experience"),
  {
    ssr: false,
    loading: () => <div className="size-full" style={{ background: PAPER }} />,
  }
)

export default function Page() {
  return (
    <main className="grid h-dvh place-items-center overflow-hidden p-[3dvh]">
      {/* The stage. `relative` + `overflow-hidden` is what makes this a
          self-contained panel: the canvas fills it, and the overlay links
          anchor to its corners rather than the viewport.

          The width cap is the available height (100dvh minus the 3dvh
          padding on each side) times 16/10, so the ratio never has to give
          way to a max-height and the stage stays exactly 16:10. */}
      <div
        className="relative aspect-[16/10] w-[min(100%,_1800px,_calc(94dvh_*_1.6))] overflow-hidden rounded-md shadow-[0_24px_80px_-12px_rgba(0,0,0,0.75)]"
        style={{ background: PAPER }}
      >
        <ShaderTrailExperience />
        <OverlayLinks />
      </div>
    </main>
  )
}
