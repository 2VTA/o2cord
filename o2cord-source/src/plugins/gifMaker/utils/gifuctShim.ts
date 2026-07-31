/*
 * Local fallback used when gifuct-js is unavailable in the bundled install.
 * Static images and videos still work; animated GIF decoding needs gifuct-js.
 */

export function parseGIF(): never {
    throw new Error("Animated GIF decoding is unavailable because gifuct-js is not bundled.");
}

export function decompressFrames(): never {
    throw new Error("Animated GIF decoding is unavailable because gifuct-js is not bundled.");
}
