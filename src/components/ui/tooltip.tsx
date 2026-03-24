import React, { useCallback, useEffect, useRef, useState } from 'react'
import BaseTippy, { tippy, useSingleton, type TippyProps } from '@tippyjs/react'
import { getTippyDelayValue } from '../../lib/tippy-utils'

function assignRef<T>(ref: React.Ref<T> | undefined, value: T) {
  if (!ref) return

  if (typeof ref === 'function') {
    ref(value)
    return
  }

  ;(ref as React.MutableRefObject<T>).current = value
}

function getChildTypeKey(children: TippyProps['children']) {
  if (!children) return 'no-child'

  if (typeof children.type === 'string') {
    return `host:${children.type}`
  }

  return `component:${(children.type as { displayName?: string; name?: string }).displayName ?? (children.type as { name?: string }).name ?? 'anonymous'}`
}

function composeEventHandler<E extends React.SyntheticEvent>(
  existingHandler: ((event: E) => void) | undefined,
  nextHandler: ((event: E) => void) | undefined,
) {
  if (!existingHandler) return nextHandler
  if (!nextHandler) return existingHandler

  return (event: E) => {
    existingHandler(event)
    nextHandler(event)
  }
}

function resolveReferenceElement(
  reference: TippyProps['reference'],
  fallbackReference: Element | null,
): Element | null {
  if (!reference) return fallbackReference
  if ('current' in reference) return reference.current
  return reference
}

type TriggerElementProps = {
  ref?: React.Ref<Element | null>
  onMouseEnter?: React.MouseEventHandler<Element>
  onMouseLeave?: React.MouseEventHandler<Element>
  onFocus?: React.FocusEventHandler<Element>
  onBlur?: React.FocusEventHandler<Element>
  onMouseDown?: React.MouseEventHandler<Element>
  onClick?: React.MouseEventHandler<Element>
  onTouchStart?: React.TouchEventHandler<Element>
}

const Tooltip = React.forwardRef<Element, TippyProps>(function Tooltip(
  { children, delay, disabled = false, reference, visible: controlledVisible, ...props },
  forwardedRef,
) {
  const fallbackReferenceRef = useRef<Element | null>(null)
  const mountedRef = useRef(true)
  const showTimeoutRef = useRef<number | null>(null)
  const hideTimeoutRef = useRef<number | null>(null)
  const [internalVisible, setInternalVisible] = useState(false)
  const childProps = (children?.props as TriggerElementProps | undefined) ?? undefined
  const childRef = childProps?.ref
  const childTypeKey = getChildTypeKey(children)
  const isControlled = controlledVisible !== undefined
  const visible = disabled ? false : (isControlled ? controlledVisible : internalVisible)

  const clearShowTimeout = useCallback(() => {
    if (showTimeoutRef.current === null) return
    window.clearTimeout(showTimeoutRef.current)
    showTimeoutRef.current = null
  }, [])

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current === null) return
    window.clearTimeout(hideTimeoutRef.current)
    hideTimeoutRef.current = null
  }, [])

  const clearTimeouts = useCallback(() => {
    clearShowTimeout()
    clearHideTimeout()
  }, [clearHideTimeout, clearShowTimeout])

  const showDelay = getTippyDelayValue(delay, 0)
  const hideDelay = getTippyDelayValue(delay, 1)

  const hideImmediately = useCallback(() => {
    if (isControlled) return
    clearTimeouts()
    if (mountedRef.current) setInternalVisible(false)
  }, [clearTimeouts, isControlled])

  const scheduleShow = useCallback(() => {
    if (disabled || isControlled) return

    clearHideTimeout()
    if (showDelay > 0) {
      clearShowTimeout()
      showTimeoutRef.current = window.setTimeout(() => {
        showTimeoutRef.current = null
        if (!mountedRef.current || disabled) return
        setInternalVisible(true)
      }, showDelay)
      return
    }

    setInternalVisible(true)
  }, [clearHideTimeout, clearShowTimeout, disabled, isControlled, showDelay])

  const scheduleHide = useCallback(() => {
    if (isControlled) return

    clearShowTimeout()
    if (hideDelay > 0) {
      clearHideTimeout()
      hideTimeoutRef.current = window.setTimeout(() => {
        hideTimeoutRef.current = null
        if (!mountedRef.current) return
        setInternalVisible(false)
      }, hideDelay)
      return
    }

    setInternalVisible(false)
  }, [clearHideTimeout, clearShowTimeout, hideDelay, isControlled])

  const handleReferenceRef = useCallback((node: Element | null) => {
    fallbackReferenceRef.current = node
    assignRef(childRef, node)
    assignRef(forwardedRef, node)
  }, [childRef, forwardedRef])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeouts()
    }
  }, [clearTimeouts])

  useEffect(() => {
    if (!disabled) return
    hideImmediately()
  }, [disabled, hideImmediately])

  useEffect(() => {
    if (isControlled || !reference) return

    const referenceElement = resolveReferenceElement(reference, fallbackReferenceRef.current)
    if (!referenceElement) return

    const handleMouseEnter = () => scheduleShow()
    const handleMouseLeave = () => scheduleHide()
    const handleFocus = () => scheduleShow()
    const handleBlur = () => scheduleHide()
    const handlePress = () => hideImmediately()

    referenceElement.addEventListener('mouseenter', handleMouseEnter)
    referenceElement.addEventListener('mouseleave', handleMouseLeave)
    referenceElement.addEventListener('focusin', handleFocus)
    referenceElement.addEventListener('focusout', handleBlur)
    referenceElement.addEventListener('mousedown', handlePress)
    referenceElement.addEventListener('click', handlePress)
    referenceElement.addEventListener('touchstart', handlePress, { passive: true })

    return () => {
      referenceElement.removeEventListener('mouseenter', handleMouseEnter)
      referenceElement.removeEventListener('mouseleave', handleMouseLeave)
      referenceElement.removeEventListener('focusin', handleFocus)
      referenceElement.removeEventListener('focusout', handleBlur)
      referenceElement.removeEventListener('mousedown', handlePress)
      referenceElement.removeEventListener('click', handlePress)
      referenceElement.removeEventListener('touchstart', handlePress)
    }
  }, [hideImmediately, isControlled, reference, scheduleHide, scheduleShow])

  const trigger = children
    ? React.cloneElement(
        children as React.ReactElement<TriggerElementProps>,
        {
          ref: handleReferenceRef,
          onMouseEnter: reference ? childProps?.onMouseEnter : composeEventHandler(childProps?.onMouseEnter, () => scheduleShow()),
          onMouseLeave: reference ? childProps?.onMouseLeave : composeEventHandler(childProps?.onMouseLeave, () => scheduleHide()),
          onFocus: reference ? childProps?.onFocus : composeEventHandler(childProps?.onFocus, () => scheduleShow()),
          onBlur: reference ? childProps?.onBlur : composeEventHandler(childProps?.onBlur, () => scheduleHide()),
          onMouseDown: reference ? childProps?.onMouseDown : composeEventHandler(childProps?.onMouseDown, () => hideImmediately()),
          onClick: reference ? childProps?.onClick : composeEventHandler(childProps?.onClick, () => hideImmediately()),
          onTouchStart: reference ? childProps?.onTouchStart : composeEventHandler(childProps?.onTouchStart, () => hideImmediately()),
        },
      )
    : null

  return (
    <>
      {trigger}
      <BaseTippy
        key={reference ? undefined : childTypeKey}
        {...props}
        visible={visible}
        reference={reference ?? (fallbackReferenceRef as React.RefObject<Element>)}
      />
    </>
  )
})

Tooltip.displayName = 'Tooltip'

export default Tooltip
export { tippy, useSingleton }
export type { TippyProps }
