"use client"

import dynamic from "next/dynamic"

const ShaderTrailExperience = dynamic(
  () => import("@/components/shader-trail/shader-trail-experience"),
  { ssr: false, loading: () => <div className="min-h-screen bg-[#bcbdb8]" /> }
)

export default function Page() {
  return <ShaderTrailExperience />
}
