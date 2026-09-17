import { twMerge } from "tailwind-merge"

type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>

function cx(...inputs: ClassValue[]): string {
  const out: string[] = []
  for (const input of inputs) {
    if (!input) continue
    if (typeof input === "string" || typeof input === "number") {
      out.push(String(input))
    } else if (Array.isArray(input)) {
      const inner = cx(...input)
      if (inner) out.push(inner)
    } else {
      for (const [key, value] of Object.entries(input)) {
        if (value) out.push(key)
      }
    }
  }
  return out.join(" ")
}

/** Merge Tailwind classes, last one wins on conflicts. */
export const cn = (...inputs: ClassValue[]) => twMerge(cx(...inputs))
