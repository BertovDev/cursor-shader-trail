import type { Metadata } from "next"
import type { PropsWithChildren } from "react"
import { fontsVariable } from "@/lib/fonts"
import "./globals.css"

export const metadata: Metadata = {
  title: "Cursor Shader Trail",
  description:
    "A cursor trail where the brush is a pluggable function. Three.js, WebGPU and TSL.",
}

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" className={fontsVariable}>
      <body>{children}</body>
    </html>
  )
}
