/**
 * The paper the effect is printed on.
 *
 * Shared so the stage, the loading placeholder, the canvas backdrop and the
 * shader's `bgColor` all start from one value. They have to agree exactly:
 * any mismatch shows up as a flash on first load, in the window between the
 * stage painting and the WebGPU renderer producing its first frame.
 */
export const PAPER = "#bcbdb8"
