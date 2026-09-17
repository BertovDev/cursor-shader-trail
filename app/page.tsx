"use client"

import dynamic from "next/dynamic"
import Link from "next/link"

const ShaderTrailExperience = dynamic(
  () => import("@/components/shader-trail/shader-trail-experience"),
  { ssr: false, loading: () => <div className="min-h-screen bg-[#bcbdb8]" /> }
)

export default function Page() {
  return (
    <>
      <ShaderTrailExperience />
      <Link
        href="/tutorial"
        className="fixed bottom-6 left-6 z-50 rounded-full border border-black/20 bg-white/70 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-black/70 backdrop-blur transition-colors hover:bg-white hover:text-black"
      >
        Step through it →
      </Link>
    </>
  )
}
