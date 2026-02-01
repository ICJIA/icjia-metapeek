# MetaPeek Accessibility Guidelines

This document provides specific accessibility implementation guidelines for MetaPeek components. All requirements are based on WCAG 2.1 Level AA standards, which MetaPeek must meet before launch.

---

## Core Accessibility Principles for MetaPeek

**Perceivable:** Information and user interface components must be presentable to users in ways they can perceive.

**Operable:** User interface components and navigation must be operable (especially via keyboard).

**Understandable:** Information and the operation of the user interface must be understandable.

**Robust:** Content must be robust enough that it can be interpreted by a wide variety of user agents, including assistive technologies.

---

## Component-Specific Guidelines

### Input Panel (URL/HTML Input)

**Keyboard Requirements:**
- Tab key moves focus to input field
- Enter key submits/processes input
- Tab key moves to mode toggle (Paste HTML / Fetch URL)
- Arrow keys or Enter toggle between modes
- All interactions possible without mouse

**Screen Reader Requirements:**
```html
<label for="meta-input" class="sr-only">
  Enter URL or paste HTML content
</label>
<input
  id="meta-input"
  type="text"
  aria-describedby="input-help"
  aria-invalid="false"
/>
<p id="input-help" class="sr-only">
  Enter a URL starting with https:// or paste HTML code to analyze meta tags
</p>
```

**Error State:**
```html
<input
  id="meta-input"
  aria-invalid="true"
  aria-errormessage="input-error"
/>
<p id="input-error" role="alert">
  That doesn't look like a valid URL. Enter a full URL starting with https://
</p>
```

**Focus Indicators:**
- Visible focus ring (2px solid, high contrast color)
- Focus state must be distinct from hover state
- Minimum 3:1 contrast ratio between focus indicator and background

---

### Status Bar (Fetch Progress)

**Live Region for Status Updates:**
```html
<div 
  role="status" 
  aria-live="polite" 
  aria-atomic="true"
  class="status-bar"
>
  <span class="status-text">
    Fetching https://example.com...
  </span>
  <span class="status-time" aria-label="Elapsed time">
    1.2s
  </span>
</div>
```

**State Transitions:**
- **Idle:** No announcement (nothing to report)
- **Fetching:** "Fetching [URL]" announced when fetch starts
- **Complete:** "Loaded 4 preview cards and diagnostics in 1.5 seconds" announced
- **Error:** Use `role="alert"` for immediate announcement

**Error State:**
```html
<div 
  role="alert" 
  aria-live="assertive"
  class="status-bar status-error"
>
  <svg aria-hidden="true" focusable="false">
    <use href="#icon-error" />
  </svg>
  <span class="status-text">
    Request timed out after 10 seconds.
  </span>
  <span class="status-suggestion">
    The target site did not respond in time. Try again, or paste the page source directly.
  </span>
</div>
```

**Color Independence:**
- Green/amber/red status must also have icons (✓, ⚠, ✕)
- Icons must have semantic meaning, not decorative
- Text must clearly indicate status without color

---

### Preview Cards

**Structure:**
```html
<section 
  aria-labelledby="preview-google-heading"
  class="preview-card"
>
  <h2 id="preview-google-heading" class="preview-card-title">
    Google Search Preview
  </h2>
  
  <div class="preview-content">
    <!-- Rendered preview -->
    <div class="google-result">
      <cite class="google-url">https://example.com</cite>
      <h3 class="google-title">Page Title Here</h3>
      <p class="google-description">Meta description appears here...</p>
    </div>
  </div>
  
  <p class="preview-note" id="google-note">
    This shows how your page appears in Google search results.
  </p>
</section>
```

**Image Handling:**
```html
<!-- OG images in preview cards -->
<img 
  src="https://example.com/og-image.jpg" 
  alt="Open Graph preview image"
  loading="lazy"
  onerror="this.style.display='none'"
/>

<!-- Decorative platform icons -->
<svg aria-hidden="true" focusable="false">
  <use href="#icon-facebook" />
</svg>
```

**Responsive Design:**
- Must work at 320px width (mobile)
- Text must be readable at 200% zoom
- No horizontal scrolling at any zoom level

---

### Diagnostics Panel

**Status Indicators:**
```html
<div class="diagnostic-item">
  <div 
    class="diagnostic-status" 
    aria-label="Status: Passed"
    role="img"
  >
    <svg aria-hidden="true" focusable="false">
      <use href="#icon-check" />
    </svg>
    <span class="status-label">Passed</span>
  </div>
  
  <div class="diagnostic-details">
    <strong>Open Graph Tags</strong>
    <p>All required Open Graph tags are present and valid.</p>
  </div>
</div>
```

**Status Levels and Their Requirements:**

**Green (Passed):**
- Icon: ✓ checkmark
- Text: "Passed" or "Complete"
- Color: Green (#22c55e or similar)
- Contrast: Must meet 4.5:1 against background

**Yellow (Warning):**
- Icon: ⚠ warning triangle
- Text: "Needs attention" or specific warning
- Color: Amber (#f59e0b or similar)
- Contrast: Must meet 4.5:1 against background

**Red (Error):**
- Icon: ✕ cross or error circle
- Text: "Missing" or "Error"
- Color: Red (#ef4444 or similar)
- Contrast: Must meet 4.5:1 against background

**Expandable Details:**
```html
<button 
  aria-expanded="false" 
  aria-controls="og-details"
  class="diagnostic-toggle"
>
  <span>Open Graph Tags</span>
  <svg aria-hidden="true" focusable="false" class="chevron">
    <use href="#icon-chevron" />
  </svg>
</button>

<div id="og-details" hidden>
  <dl class="tag-list">
    <dt>og:title</dt>
    <dd>Example Title</dd>
    
    <dt>og:description</dt>
    <dd>Example description text...</dd>
  </dl>
</div>
```

---

### Code Generator

**Editable Code Block:**
```html
<section aria-labelledby="code-generator-heading">
  <h2 id="code-generator-heading">
    Generated Meta Tags
  </h2>
  
  <div class="code-block-wrapper">
    <label for="generated-code" class="sr-only">
      HTML meta tags code snippet
    </label>
    <pre><code 
      id="generated-code"
      contenteditable="true"
      spellcheck="false"
      role="textbox"
      aria-multiline="true"
      aria-label="Editable meta tags HTML code"
    ><!-- Generated HTML here --></code></pre>
  </div>
  
  <button 
    type="button"
    aria-label="Copy meta tags to clipboard"
    class="copy-button"
  >
    <svg aria-hidden="true" focusable="false">
      <use href="#icon-copy" />
    </svg>
    <span>Copy HTML</span>
  </button>
</section>
```

**Copy Confirmation:**
```typescript
// Show accessible toast notification
const toast = useToast()

function copyCode() {
  navigator.clipboard.writeText(code)
  
  // Visual + screen reader announcement
  toast.add({
    title: 'Copied to clipboard',
    description: 'HTML snippet copied successfully',
    timeout: 3000,
    role: 'status', // Polite announcement
  })
}
```

---

### Skeleton Placeholders (Loading State)

**Important:** Skeletons are visual-only indicators:

```html
<div 
  class="preview-card-skeleton" 
  aria-hidden="true"
  role="presentation"
>
  <!-- Skeleton shapes -->
  <div class="skeleton-line"></div>
  <div class="skeleton-line short"></div>
</div>
```

**Why `aria-hidden="true"`?**
- Skeletons convey no information beyond "loading"
- The status bar already announces loading state
- Screen readers should hear "Fetching..." not "loading placeholder loading placeholder"

---

### Modals and Overlays (if added in Phase 3)

**Focus Trapping:**
```typescript
// When modal opens
const firstFocusableElement = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
const lastFocusableElement = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')[elements.length - 1]

firstFocusableElement.focus()

// Trap focus within modal
modal.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    if (e.shiftKey && document.activeElement === firstFocusableElement) {
      e.preventDefault()
      lastFocusableElement.focus()
    } else if (!e.shiftKey && document.activeElement === lastFocusableElement) {
      e.preventDefault()
      firstFocusableElement.focus()
    }
  }
  
  if (e.key === 'Escape') {
    closeModal()
  }
})
```

**Modal Structure:**
```html
<div 
  role="dialog" 
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>
  <h2 id="modal-title">Dialog Title</h2>
  <p id="modal-description">Dialog content...</p>
  
  <button type="button" aria-label="Close dialog">
    Close
  </button>
</div>
```

---

## Color Contrast Requirements

All text must meet WCAG AA contrast requirements:

| Element | Minimum Contrast |
|---------|------------------|
| Normal text (< 18pt) | 4.5:1 |
| Large text (≥ 18pt or ≥ 14pt bold) | 3:1 |
| UI components (borders, icons) | 3:1 |
| Focus indicators | 3:1 |

**Testing Tools:**
- Chrome DevTools Color Picker (shows contrast ratio)
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- Nuxt UI typically provides AA-compliant colors by default, but verify

**Common Failures to Avoid:**
- Gray text on light gray background
- Light blue links on white background
- Subtle borders that disappear at high zoom

---

## Keyboard Shortcuts

MetaPeek should support standard keyboard patterns:

| Key | Action |
|-----|--------|
| Tab | Move focus forward |
| Shift+Tab | Move focus backward |
| Enter | Activate button/link, submit form |
| Space | Activate button, toggle checkbox |
| Escape | Close modal/dropdown, clear input |
| Arrow Keys | Navigate within custom widgets (if any) |

**Do NOT:**
- Trap focus outside modal context
- Override standard browser shortcuts (Cmd+L, Cmd+T, etc.)
- Require mouse for any functionality
- Use custom keyboard shortcuts without documentation

---

## Screen Reader Testing Script

Use this script to verify screen reader experience:

### Test 1: Paste HTML Workflow (5 minutes)
1. Navigate to MetaPeek with screen reader enabled
2. Tab to input field - verify label announced
3. Paste sample HTML and press Enter
4. Listen for status announcements
5. Tab through preview cards - verify headings and content
6. Navigate to diagnostics - verify status levels announced
7. Navigate to code generator - verify code is readable
8. Activate copy button - verify confirmation announced

**Expected announcements:**
- "Enter URL or paste HTML content, edit text"
- "Analyzing HTML..."
- "Loaded 4 preview cards and diagnostics"
- "Google Search Preview, heading level 2"
- "Status: Warning, Open Graph tags need attention"
- "Copy meta tags to clipboard, button"
- "Copied to clipboard, status"

### Test 2: Fetch URL Workflow (7 minutes)
1. Navigate to input field
2. Enter URL and press Enter
3. Listen for status updates during fetch
4. Verify timeout/error announcements if slow
5. Verify success announcement when complete
6. Navigate through loaded preview cards
7. Verify diagnostics are accessible

**Expected announcements:**
- "Fetching https://example.com"
- "Still waiting, 5 seconds elapsed"
- "Loaded 4 preview cards and diagnostics in 3.2 seconds"

### Test 3: Error Handling (3 minutes)
1. Enter invalid URL
2. Verify error announced immediately (role="alert")
3. Verify suggestion is included
4. Verify can recover and try again

---

## Mobile Accessibility

### Touch Targets
- Minimum 44x44px touch target size (WCAG 2.1 AAA is 44x44, AA is more lenient but 44x44 is best practice)
- Adequate spacing between interactive elements (minimum 8px)
- Buttons must be easily tappable

### Mobile Screen Reader (VoiceOver/TalkBack)
- Swipe gestures work correctly
- Double-tap activates elements
- Rotor navigation (headings, links, form controls) works
- Status announcements audible

---

## Nuxt UI Specific Considerations

Nuxt UI components generally follow accessibility best practices, but verify:

**UButton:**
- Has proper contrast in all color variants
- Focus indicator visible
- Loading state announced to screen readers

**UInput:**
- Label properly associated
- Error states use aria-invalid and aria-errormessage
- Help text linked via aria-describedby

**UAlert / UNotification:**
- Appropriate role (status vs alert)
- aria-live configured correctly
- Auto-dismiss doesn't lose important information

**UCard:**
- Proper heading hierarchy
- Focusable elements within card are accessible

**Customize Nuxt UI defaults if needed:**
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  ui: {
    primary: 'blue',
    gray: 'slate',
    // Verify these colors meet contrast requirements
  }
})
```

---

## Automated Testing Requirements

Before considering any component complete:

1. **Run axe DevTools scan**
   - Zero violations
   - Zero incomplete items (or document why incomplete)

2. **Run Lighthouse audit**
   - Accessibility score: 100
   - No manual checks should fail

3. **Run Pa11y or similar CLI tool**
   ```bash
   npx pa11y http://localhost:3000
   ```

4. **Test with keyboard only**
   - Unplug mouse
   - Complete full workflow
   - Document any issues

---

## Accessibility Checklist for Code Review

Before merging any component:

- [ ] All interactive elements keyboard accessible
- [ ] Focus indicators visible (test with Tab key)
- [ ] Color contrast verified (4.5:1 for text, 3:1 for UI)
- [ ] ARIA labels present where needed
- [ ] Live regions configured for dynamic content
- [ ] Form inputs have associated labels
- [ ] Error messages use appropriate ARIA attributes
- [ ] Images have alt text (or aria-hidden if decorative)
- [ ] Headings in logical hierarchy (h1 → h2 → h3, no skips)
- [ ] Status/role attributes used correctly
- [ ] No keyboard traps (can Tab out of everything)
- [ ] Tested with screen reader (NVDA or VoiceOver minimum)
- [ ] Tested at 200% zoom - no content cut off
- [ ] axe DevTools reports zero violations

---

## Resources and Tools

**Testing Tools:**
- axe DevTools (Chrome/Firefox): https://www.deque.com/axe/devtools/
- Lighthouse (built into Chrome DevTools)
- WAVE browser extension: https://wave.webaim.org/extension/
- Pa11y (CLI tool): https://pa11y.org/

**Screen Readers:**
- NVDA (Windows, free): https://www.nvaccess.org/
- JAWS (Windows, paid/trial): https://www.freedomscientific.com/products/software/jaws/
- VoiceOver (macOS/iOS, built-in): Cmd+F5 to toggle
- TalkBack (Android, built-in): Settings → Accessibility

**References:**
- WCAG 2.1 Quick Reference: https://www.w3.org/WAI/WCAG21/quickref/
- MDN Accessibility: https://developer.mozilla.org/en-US/docs/Web/Accessibility
- A11y Project Checklist: https://www.a11yproject.com/checklist/
- Inclusive Components: https://inclusive-components.design/

**Color Tools:**
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- Coolors Contrast Checker: https://coolors.co/contrast-checker
- Chrome DevTools Color Picker (built-in)

---

## Common Violations and Fixes

### ❌ Missing alt text
```html
<!-- Wrong -->
<img src="preview.jpg">

<!-- Right -->
<img src="preview.jpg" alt="Open Graph preview image">

<!-- If decorative -->
<img src="icon.svg" alt="" aria-hidden="true">
```

### ❌ Non-descriptive button text
```html
<!-- Wrong -->
<button>Click here</button>

<!-- Right -->
<button>Copy meta tags to clipboard</button>
```

### ❌ Missing form labels
```html
<!-- Wrong -->
<input type="text" placeholder="Enter URL">

<!-- Right -->
<label for="url-input">Enter URL</label>
<input id="url-input" type="text" placeholder="https://example.com">
```

### ❌ Color-only status
```html
<!-- Wrong -->
<span class="text-red-500">Error</span>

<!-- Right -->
<span class="text-red-500">
  <svg aria-hidden="true"><use href="#icon-error" /></svg>
  <span>Error</span>
</span>
```

### ❌ Keyboard trap
```typescript
// Wrong - prevents Tab key from working normally
input.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault()
  }
})

// Right - let Tab work naturally
// Only trap focus in modals, not regular inputs
```

---

## When in Doubt

1. **Test with a screen reader.** If it's confusing to you, it's confusing to users.
2. **Unplug your mouse.** Can you complete the task with keyboard only?
3. **Run axe DevTools.** It catches 30-40% of issues automatically.
4. **Check WCAG Quick Reference.** The official docs have examples: https://www.w3.org/WAI/WCAG21/quickref/

**Accessibility is not optional for MetaPeek. When accessibility conflicts with design preferences, accessibility wins.**
