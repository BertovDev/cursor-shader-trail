import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Relative asset paths, so the built demo can be dropped into a
  // subdirectory on someone else's server.
  output: "export",
  assetPrefix: "",
  images: { unoptimized: true },
  transpilePackages: ["three"],
}

export default nextConfig
