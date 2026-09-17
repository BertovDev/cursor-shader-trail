import localFont from "next/font/local"

const alteHaas = localFont({
  src: [
    {
      path: "../public/fonts/alte-haas-grotesk/AlteHaasGroteskRegular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/alte-haas-grotesk/AlteHaasGroteskBold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--alte-haas",
  preload: true,
  adjustFontFallback: "Arial",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
})

const fontsVariable = alteHaas.variable

export { alteHaas, fontsVariable }
