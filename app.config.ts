export default defineAppConfig({
  ui: {
    // Clean, neutral primary color for Swiss design aesthetic
    colors: {
      primary: 'neutral',
      secondary: 'blue',
      success: 'emerald',
      warning: 'amber',
      error: 'red'
    },
    // Card styling - minimal borders, subtle shadows
    card: {
      rounded: 'rounded-lg',
      shadow: 'shadow-sm',
      ring: 'ring-1 ring-gray-200 dark:ring-gray-800'
    },
    // Button styling - clean and minimal
    button: {
      rounded: 'rounded-md',
      font: 'font-medium'
    }
  }
})
