<script setup lang="ts">
/**
 * AppTooltip - A simple, accessible, responsive tooltip component
 * 
 * Features:
 * - Keyboard accessible (shows on focus)
 * - Mouse accessible (shows on hover)
 * - Screen reader compatible (aria-describedby)
 * - Auto-positioning based on viewport space
 * - Responsive (adjusts on mobile)
 * - Configurable delay
 * - No external dependencies
 * 
 * Usage:
 * <AppTooltip text="Tooltip content">
 *   <button>Hover me</button>
 * </AppTooltip>
 * 
 * <AppTooltip text="Tooltip" position="bottom" :delay="200">
 *   <span>With options</span>
 * </AppTooltip>
 */

interface Props {
  text: string
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
  delay?: number
}

const props = withDefaults(defineProps<Props>(), {
  position: 'auto',
  delay: 0
})

const isVisible = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const computedPosition = ref<'top' | 'bottom' | 'left' | 'right'>('top')
const tooltipId = `tooltip-${Math.random().toString(36).substring(2, 9)}`
let showTimeout: ReturnType<typeof setTimeout> | null = null
let hideTimeout: ReturnType<typeof setTimeout> | null = null

// Calculate best position based on available viewport space
const calculatePosition = () => {
  if (props.position !== 'auto') {
    computedPosition.value = props.position
    return
  }

  if (!triggerRef.value) {
    computedPosition.value = 'top'
    return
  }

  const rect = triggerRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = 80 // Minimum space needed for tooltip
  
  // Check available space in each direction
  const spaceTop = rect.top
  const spaceBottom = viewportHeight - rect.bottom
  const spaceLeft = rect.left
  const spaceRight = viewportWidth - rect.right

  // On mobile (narrow screens), prefer top/bottom
  const isMobile = viewportWidth < 640

  if (isMobile) {
    // On mobile, prefer bottom if enough space, otherwise top
    computedPosition.value = spaceBottom > margin ? 'bottom' : 'top'
    return
  }

  // Find the direction with most space
  const spaces = [
    { dir: 'top' as const, space: spaceTop },
    { dir: 'bottom' as const, space: spaceBottom },
    { dir: 'left' as const, space: spaceLeft },
    { dir: 'right' as const, space: spaceRight }
  ]

  // Prefer top/bottom over left/right, then pick the one with most space
  const verticalSpaces = spaces.filter(s => s.dir === 'top' || s.dir === 'bottom')
  const bestVertical = verticalSpaces.reduce((a, b) => a.space > b.space ? a : b)
  
  if (bestVertical.space > margin) {
    computedPosition.value = bestVertical.dir
  } else {
    // Fall back to horizontal if vertical space is limited
    const horizontalSpaces = spaces.filter(s => s.dir === 'left' || s.dir === 'right')
    const bestHorizontal = horizontalSpaces.reduce((a, b) => a.space > b.space ? a : b)
    computedPosition.value = bestHorizontal.dir
  }
}

const show = () => {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  
  calculatePosition()
  
  if (props.delay > 0) {
    showTimeout = setTimeout(() => {
      isVisible.value = true
    }, props.delay)
  } else {
    isVisible.value = true
  }
}

const hide = () => {
  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }
  // Small delay before hiding to allow moving to tooltip
  hideTimeout = setTimeout(() => {
    isVisible.value = false
  }, 100)
}

const positionClasses = computed(() => {
  const base = 'absolute z-[9999] px-2 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-md shadow-lg max-w-xs'
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }
  return `${base} ${positions[computedPosition.value]}`
})

const arrowClasses = computed(() => {
  const base = 'absolute w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45'
  const positions = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-1',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-1',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-1'
  }
  return `${base} ${positions[computedPosition.value]}`
})

onUnmounted(() => {
  if (showTimeout) clearTimeout(showTimeout)
  if (hideTimeout) clearTimeout(hideTimeout)
})
</script>

<template>
  <div 
    ref="triggerRef"
    class="relative inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <!-- Trigger element -->
    <div :aria-describedby="isVisible ? tooltipId : undefined">
      <slot />
    </div>
    
    <!-- Tooltip -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isVisible"
        :id="tooltipId"
        role="tooltip"
        :class="positionClasses"
      >
        {{ text }}
        <div :class="arrowClasses" />
      </div>
    </Transition>
  </div>
</template>
