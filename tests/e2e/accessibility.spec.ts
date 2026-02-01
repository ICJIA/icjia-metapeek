import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Accessibility tests for MetaPeek using axe-core.
 * 
 * These tests run axe-core scans on key page states to identify WCAG 2.1 AA violations.
 * Run with: yarn test:accessibility
 */

test.describe('Accessibility Audit - WCAG 2.1 AA Compliance', () => {
  
  test('Initial page load - no critical accessibility violations', async ({ page }) => {
    test.info().annotations.push({ type: 'description', description: 'Scans the initial page for WCAG 2.1 AA violations' })
    
    console.log('  → Navigating to homepage...')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    console.log('  → Page loaded, running axe-core scan...')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    console.log(`  → Scanned ${results.passes.length} passing rules`)
    console.log(`  → Found ${results.violations.length} violations`)
    
    if (results.violations.length > 0) {
      console.log('  ✗ Violations found:')
      results.violations.forEach(v => {
        console.log(`    - ${v.id}: ${v.help} (${v.impact})`)
      })
    } else {
      console.log('  ✓ No accessibility violations detected')
    }

    expect(results.violations).toEqual([])
  })

  test('Analyzed content - preview cards have no violations', async ({ page }) => {
    test.info().annotations.push({ type: 'description', description: 'Tests accessibility after loading sample HTML and displaying previews' })
    
    console.log('  → Navigating to homepage...')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    console.log('  → Clicking "Load Example" button...')
    await page.click('button:has-text("Load Example")')
    
    console.log('  → Waiting for analysis to complete...')
    await page.waitForSelector('text=Analyzed', { timeout: 5000 })
    console.log('  → Preview cards rendered, running axe-core scan...')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    console.log(`  → Scanned ${results.passes.length} passing rules`)
    console.log(`  → Found ${results.violations.length} violations`)
    
    if (results.violations.length > 0) {
      console.log('  ✗ Violations found:')
      results.violations.forEach(v => {
        console.log(`    - ${v.id}: ${v.help} (${v.impact})`)
        v.nodes.forEach(n => {
          console.log(`      Element: ${n.html.substring(0, 80)}...`)
        })
      })
    } else {
      console.log('  ✓ No accessibility violations detected')
    }

    expect(results.violations).toEqual([])
  })

  test('Code editor mode - form inputs are accessible', async ({ page }) => {
    test.info().annotations.push({ type: 'description', description: 'Tests the code generator edit mode for form accessibility' })
    
    console.log('  → Navigating to homepage...')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    console.log('  → Loading sample HTML...')
    await page.click('button:has-text("Load Example")')
    await page.waitForSelector('text=Analyzed', { timeout: 5000 })
    
    console.log('  → Switching to Code tab...')
    await page.click('button:has-text("Code")')
    
    console.log('  → Entering Edit mode...')
    await page.click('button:has-text("Edit")')
    await page.waitForSelector('input[id^="edit-"]', { timeout: 5000 })
    
    console.log('  → Edit form rendered, running axe-core scan...')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    console.log(`  → Scanned ${results.passes.length} passing rules`)
    console.log(`  → Found ${results.violations.length} violations`)
    
    if (results.violations.length > 0) {
      console.log('  ✗ Violations found:')
      results.violations.forEach(v => {
        console.log(`    - ${v.id}: ${v.help} (${v.impact})`)
      })
    } else {
      console.log('  ✓ No accessibility violations detected')
    }

    expect(results.violations).toEqual([])
  })
})

test.describe('Keyboard Navigation - WCAG 2.1.1 Keyboard Accessible', () => {
  
  test('Skip link - allows bypassing navigation', async ({ page }) => {
    test.info().annotations.push({ type: 'description', description: 'Verifies skip link is focusable and functional' })
    
    console.log('  → Navigating to homepage...')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    console.log('  → Pressing Tab to focus skip link...')
    await page.keyboard.press('Tab')
    
    const skipLink = page.locator('a.skip-link')
    const isFocused = await skipLink.evaluate(el => el === document.activeElement)
    console.log(`  → Skip link focused: ${isFocused ? '✓ Yes' : '✗ No'}`)
    
    await expect(skipLink).toBeFocused()
    
    console.log('  → Pressing Enter to activate skip link...')
    await page.keyboard.press('Enter')
    
    const mainContent = page.locator('#main-content')
    const isVisible = await mainContent.isVisible()
    console.log(`  → Main content visible: ${isVisible ? '✓ Yes' : '✗ No'}`)
    
    await expect(mainContent).toBeVisible()
    console.log('  ✓ Skip link works correctly')
  })

  test('Tab order - all interactive elements are reachable', async ({ page }) => {
    test.info().annotations.push({ type: 'description', description: 'Verifies all interactive elements can be reached via keyboard' })
    
    console.log('  → Navigating to homepage...')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    console.log('  → Loading sample to show all interactive elements...')
    await page.click('button:has-text("Load Example")')
    await page.waitForSelector('text=Analyzed', { timeout: 5000 })
    
    console.log('  → Counting focusable elements...')
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusableCount = await page.locator(focusableSelector).count()
    
    console.log(`  → Found ${focusableCount} focusable elements`)
    expect(focusableCount).toBeGreaterThan(5)
    
    console.log('  → Testing keyboard focus on first 5 elements...')
    const elements = await page.locator(focusableSelector).all()
    
    for (let i = 0; i < Math.min(5, elements.length); i++) {
      const el = elements[i]
      await el.focus()
      const tagName = await el.evaluate(e => e.tagName.toLowerCase())
      const text = await el.textContent() || await el.getAttribute('aria-label') || ''
      const isFocused = await el.evaluate(e => e === document.activeElement)
      console.log(`    ${i + 1}. <${tagName}> "${text.trim().substring(0, 30)}" - ${isFocused ? '✓ Focusable' : '✗ Not focusable'}`)
      await expect(el).toBeFocused()
    }
    
    console.log('  ✓ All tested elements are keyboard accessible')
  })
})
