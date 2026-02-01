<script setup lang="ts">
/**
 * AppTooltip - A simple, accessible, responsive tooltip component
 * 
 * Features:
 * - Fixed positioning (escapes overflow:hidden parents)
 * - Keyboard accessible (shows on focus)
 * - Mouse accessible (shows on hover)
 * - Screen reader compatible (aria-describedby)
 * - Auto-positioning based on viewport space
 * - Always horizontal text layout
 * - No external dependencies
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
const tooltipStyle = ref<Record<string, string>>({})
const arrowStyle = ref<Record<string, string>>({})
const computedPosition = ref<'top' | 'bottom' | 'left' | 'right'>('left')
const tooltipId = `tooltip-${Math.random().toString(36).substring(2, 9)}`
let showTimeout: ReturnType<typeof setTimeout> | null = null
let hideTimeout: ReturnType<typeof setTimeout> | null = null

const calculatePositionAndStyle = () => {
  if (!triggerRef.value) return

  const rect = triggerRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const gap = 8 // Gap between trigger and tooltip
  const tooltipMinWidth = 200 // Estimated tooltip width for positioning

  // Calculate available space
  const spaceLeft = rect.left
  const spaceRight = viewportWidth - rect.right
  const spaceTop = rect.top
  const spaceBottom = viewportHeight - rect.bottom

  // Determine best position based on screen size and available space
  let pos: 'top' | 'bottom' | 'left' | 'right' = props.position !== 'auto' ? props.position : 'left'
  
  if (props.position === 'auto') {
    const isMobile = viewportWidth < 640
    
    if (isMobile) {
      // On mobile, prefer top/bottom (more vertical space typically)
      pos = spaceTop > spaceBottom ? 'top' : 'bottom'
    } else {
      // On desktop, prefer horizontal positioning for better text display
      if (spaceLeft >= tooltipMinWidth) {
        pos = 'left'
      } else if (spaceRight >= tooltipMinWidth) {
        pos = 'right'
      } else if (spaceTop > spaceBottom && spaceTop > 50) {
        pos = 'top'
      } else {
        pos = 'bottom'
      }
    }
  }

  computedPosition.value = pos

  // Calculate fixed position styles
  const centerY = rect.top + rect.height / 2
  const centerX = rect.left + rect.width / 2

  switch (pos) {
    case 'left':
      tooltipStyle.value = {
        position: 'fixed',
        top: `${centerY}px`,
        right: `${viewportWidth - rect.left + gap}px`,
        transform: 'translateY(-50%)',
        zIndex: '9999'
      }
      arrowStyle.value = {
        position: 'absolute',
        top: '50%',
        right: '-4px',
        transform: 'translateY(-50%) rotate(45deg)'
      }
      break
    case 'right':
      tooltipStyle.value = {
        position: 'fixed',
        top: `${centerY}px`,
        left: `${rect.right + gap}px`,
        transform: 'translateY(-50%)',
        zIndex: '9999'
      }
      arrowStyle.value = {
        position: 'absolute',
        top: '50%',
        left: '-4px',
        transform: 'translateY(-50%) rotate(45deg)'
      }
      break
    case 'top':
      tooltipStyle.value = {
        position: 'fixed',
        bottom: `${viewportHeight - rect.top + gap}px`,
        left: `${centerX}px`,
        transform: 'translateX(-50%)',
        zIndex: '9999'
      }
      arrowStyle.value = {
        position: 'absolute',
        bottom: '-4px',
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)'
      }
      break
    case 'bottom':
      tooltipStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + gap}px`,
        left: `${centerX}px`,
        transform: 'translateX(-50%)',
        zIndex: '9999'
      }
      arrowStyle.value = {
        position: 'absolute',
        top: '-4px',
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)'
      }
      break
  }
}

const show = () => {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  
  calculatePositionAndStyle()
  
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
  hideTimeout = setTimeout(() => {
    isVisible.value = false
  }, 100)
}

onUnmounted(() => {
  if (showTimeout) clearTimeout(showTimeout)
  if (hideTimeout) clearTimeout(hideTimeout)
})
</script>

<template>
  <div 
    ref="triggerRef"
    class="inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <!-- Trigger element -->
    <div :aria-describedby="isVisible ? tooltipId : undefined">
      <slot />
    </div>
    
    <!-- Tooltip (using Teleport to body to escape overflow) -->
    <Teleport to="body">
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
          :style="tooltipStyle"
          class="px-2.5 py-1.5 text-sm font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-md shadow-lg whitespace-nowrap"
        >
          {{ text }}
          <div 
            :style="arrowStyle"
            class="w-2 h-2 bg-gray-900 dark:bg-gray-700"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
