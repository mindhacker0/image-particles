import { gsap } from 'gsap'

/**
 * GSAP 2 style API surface used by the legacy engine:
 *   TweenLite.to(target, duration, vars)
 *   TweenLite.set(target, vars)
 *   TweenLite.killTweensOf(target)
 *   TweenLite.delayedCall(delay, callback, params, scope)
 *   TweenLite.killDelayedCallsTo(callback)
 *
 * GSAP 3 moved `duration` into the vars object, so the raw npm export cannot be
 * aliased directly. This facade keeps the legacy call signatures working.
 */

type TweenTarget = object | string | null

const asTarget = (target: unknown): TweenTarget => target as TweenTarget

const isDomElement = (target: unknown): boolean =>
  typeof Element !== 'undefined' && target instanceof Element

const withDuration = (duration: number | undefined, vars: Record<string, unknown>) => ({
  ...vars,
  duration: duration ?? 0.5,
})

/** GSAP 2 `on*Scope` keys were removed in GSAP 3: bind the callback instead. */
const SCOPE_CALLBACKS: Record<string, string> = {
  onStartScope: 'onStart',
  onUpdateScope: 'onUpdate',
  onCompleteScope: 'onComplete',
  onRepeatScope: 'onRepeat',
  onReverseCompleteScope: 'onReverseComplete',
}

/** GSAP 2 `on*Params` keys were removed as well: apply the arguments ourselves. */
const PARAM_CALLBACKS: Record<string, string> = {
  onStartParams: 'onStart',
  onUpdateParams: 'onUpdate',
  onCompleteParams: 'onComplete',
  onRepeatParams: 'onRepeat',
  onReverseCompleteParams: 'onReverseComplete',
}

/**
 * GSAP 2 animated `alpha` on DOM elements, GSAP 3 uses `opacity`.
 * Only DOM targets are rewritten: plain objects keep their own `alpha` member
 * (shader uniforms such as `material.uniforms.alpha` rely on it).
 */
function normalizeVars(target: unknown, vars?: Record<string, unknown>): Record<string, unknown> {
  if (!vars) return {}

  let result = vars

  // GSAP 2 accepted an object here (`{ left: 0, top: '50%' }`), GSAP 3 only
  // takes a string such as `0 50%`.
  if ('transformOrigin' in result) {
    const converted = normalizeTransformOrigin(result.transformOrigin)
    if (converted !== result.transformOrigin) {
      result = { ...result, transformOrigin: converted }
    }
  }

  for (const scopeKey of Object.keys(SCOPE_CALLBACKS)) {
    if (!(scopeKey in result)) continue

    const scope = result[scopeKey]
    const callbackKey = SCOPE_CALLBACKS[scopeKey]
    const callback = result[callbackKey]

    const rest = { ...result }
    delete rest[scopeKey]

    result = typeof callback === 'function' && scope
      ? { ...rest, [callbackKey]: (callback as (...args: unknown[]) => unknown).bind(scope) }
      : rest
  }

  // after the scope pass the callbacks are already bound, so the arguments can
  // simply be re-applied
  for (const paramsKey of Object.keys(PARAM_CALLBACKS)) {
    if (!(paramsKey in result)) continue

    const params = result[paramsKey]
    const callbackKey = PARAM_CALLBACKS[paramsKey]
    const callback = result[callbackKey]

    const rest = { ...result }
    delete rest[paramsKey]

    if (typeof callback === 'function' && Array.isArray(params)) {
      rest[callbackKey] = function () {
        return (callback as (...args: unknown[]) => unknown)(...params)
      }
    }

    result = rest
  }

  if ('alpha' in result && isDomElement(target)) {
    const { alpha, ...rest } = result
    result = { ...rest, opacity: alpha }
  }

  return result
}

function normalizeTransformOrigin(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value

  const origin = value as { left?: string | number; top?: string | number }
  const parts: string[] = []

  if (origin.left !== undefined) parts.push(String(origin.left))
  if (origin.top !== undefined) parts.push(String(origin.top))

  return parts.length ? parts.join(' ') : value
}

const linearEase = {
  ease: 'none',
  easeNone: 'none',
  easeIn: 'none',
  easeOut: 'none',
  easeInOut: 'none',
}

const easingFamily = (name: string) => ({
  ease: `${name}.out`,
  easeIn: `${name}.in`,
  easeOut: `${name}.out`,
  easeInOut: `${name}.inOut`,
})

/** Globals `Linear`, `Expo`, `Back`, ... that legacy code passes as `ease`. */
export const legacyEases = {
  Linear: linearEase,
  Power0: linearEase,
  Sine: easingFamily('sine'),
  Quad: easingFamily('quad'),
  Power1: easingFamily('power1'),
  Cubic: easingFamily('cubic'),
  Power2: easingFamily('power2'),
  Quart: easingFamily('quart'),
  Power3: easingFamily('power3'),
  Quint: easingFamily('quint'),
  Strong: easingFamily('power4'),
  Power4: easingFamily('power4'),
  Circ: easingFamily('circ'),
  Expo: easingFamily('expo'),
  Back: easingFamily('back'),
  Bounce: easingFamily('bounce'),
  Elastic: easingFamily('elastic'),
}

export const TweenLite = {
  to(target: unknown, duration?: number, vars?: Record<string, unknown>) {
    return gsap.to(asTarget(target), withDuration(duration, normalizeVars(target, vars)))
  },
  from(target: unknown, duration?: number, vars?: Record<string, unknown>) {
    return gsap.from(asTarget(target), withDuration(duration, normalizeVars(target, vars)))
  },
  fromTo(
    target: unknown,
    duration: number | undefined,
    fromVars: Record<string, unknown> | undefined,
    toVars: Record<string, unknown> | undefined,
  ) {
    return gsap.fromTo(
      asTarget(target),
      normalizeVars(target, fromVars),
      withDuration(duration, normalizeVars(target, toVars)),
    )
  },
  set(target: unknown, vars?: Record<string, unknown>) {
    return gsap.set(asTarget(target), normalizeVars(target, vars))
  },
  killTweensOf(target: unknown) {
    gsap.killTweensOf(asTarget(target))
  },
  killDelayedCallsTo(callback: unknown) {
    gsap.killTweensOf(asTarget(callback))
  },
  delayedCall(
    delay: number,
    callback: (...args: unknown[]) => void,
    params?: unknown[],
    scope?: unknown,
  ) {
    // GSAP 3 supports the `scope` argument at runtime (as GSAP 2 did) even
    // though its type definitions only declare three parameters.
    const delayedCall = gsap.delayedCall as unknown as (
      delay: number,
      callback: () => void,
      params: unknown[],
      scope?: unknown,
    ) => unknown

    return delayedCall(delay, callback, params ?? [], scope)
  },
}
