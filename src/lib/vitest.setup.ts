/**
 * Vitest setup file. Registers the Effect-aware `toEqualValue` matcher
 * globally so every test file picks it up. Tests compose their own per-test
 * Layers — there is no shared global Layer, which keeps them isolated.
 */
import '@/lib/effect-assert'
