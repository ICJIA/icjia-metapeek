# MetaPeek Initial package.json

This is the initial package.json with locked dependency versions for MetaPeek Phase 1.

```json
{
  "name": "icjia-metapeek",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "test:unit": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:accessibility": "playwright test",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "typecheck": "nuxt typecheck"
  },
  "dependencies": {
    "@nuxt/ui": "^4.4.0",
    "nuxt": "^4.3.0",
    "vue": "^3.5.27"
  },
  "devDependencies": {
    "@axe-core/playwright": "^4.10.2",
    "@nuxt/eslint": "^0.7.2",
    "@nuxt/test-utils": "^3.14.3",
    "@playwright/test": "^1.49.0",
    "@vue/test-utils": "^2.4.6",
    "@vitest/coverage-v8": "^4.0.18",
    "cheerio": "^1.0.0",
    "eslint": "^9.15.0",
    "happy-dom": "^15.11.7",
    "typescript": "^5.7.2",
    "vitest": "^4.0.18"
  }
}
```

## Notes on Versions

### Core Framework
- **Nuxt 4.3.0:** Latest stable Nuxt 4 (released July 2025, stable as of Feb 2026)
- **Vue 3.5.27:** Latest Vue 3 with performance improvements and better TypeScript support
- **@nuxt/ui 4.4.0:** Latest stable Nuxt UI v4 with full component library and accessibility improvements

### Server-Side Parsing
- **cheerio 1.0.0:** Fast, jQuery-like HTML parsing for server route (Phase 2)
- Note: Client-side uses native DOMParser (no additional dependency)

### Testing Framework
- **vitest 4.0.18:** Modern, fast test runner built on Vite
- **@vue/test-utils 2.4.6:** Official Vue component testing utilities
- **happy-dom 15.11.7:** Fast DOM implementation for tests
- **@playwright/test 1.49.0:** E2E testing framework
- **@axe-core/playwright 4.10.2:** Accessibility testing with Playwright
- **@vitest/coverage-v8 4.0.18:** Code coverage reporting

### Development Tools
- **typescript 5.7.2:** Latest TypeScript with improved type inference
- **@nuxt/eslint 0.7.2:** Official Nuxt ESLint configuration
- **eslint 9.15.0:** JavaScript linting

## Installation Instructions

```bash
# Create new directory
mkdir icjia-metapeek
cd icjia-metapeek

# Initialize with this package.json
# Copy the JSON above to package.json

# Install dependencies
npm install

# Create lock file
npm install --package-lock-only

# Verify installations
npm list --depth=0
```

## Post-Installation Steps

1. **Verify Nuxt version:**
   ```bash
   npx nuxi info
   ```
   Should show Nuxt 3.14.x and Vue 3.5.x

2. **Verify TypeScript:**
   ```bash
   npx tsc --version
   ```
   Should show 5.7.2

3. **Verify Nuxt UI:**
   Check that @nuxt/ui module is properly installed and working

4. **Run initial build:**
   ```bash
   npm run dev
   ```
   Should start development server on port 3000

## Updating Dependencies

Before updating any dependency, check:
1. Breaking changes in changelog
2. WCAG 2.1 AA compliance maintained
3. All tests still pass
4. Accessibility audits still pass

```bash
# Check for updates
npm outdated

# Update specific package (after reviewing changes)
npm update <package-name>

# Verify no breaking changes
npm test
npm run build
```

## Security Audits

Run security audits regularly:

```bash
# Check for vulnerabilities
npm audit

# Fix automatically fixable issues
npm audit fix

# Manual review for breaking changes
npm audit fix --force  # Use with caution
```

## Lock File Management

- **ALWAYS commit package-lock.json** to git
- Never use `npm install` without a lock file in production
- Use `npm ci` in CI/CD pipelines for reproducible builds

## Additional Phase 2 Dependencies

When starting Phase 2, add:

```bash
# For server-side proxy (already included cheerio)
npm install ofetch  # HTTP client (may be included with Nuxt)
```

Note: ofetch is included with Nuxt, so verify before adding separately.

## Known Issues

### Issue: Nuxt 4 Stable Release
- Design doc correctly references Nuxt 4.3.0, the latest stable version
- Nuxt 4 was released July 2025 and is production-ready
- Migration from Nuxt 3 to Nuxt 4 guide: https://nuxt.com/docs/getting-started/upgrade

### Issue: Nuxt UI v4
- Project uses Nuxt UI v4.4.0, the latest stable version
- Migration from v2/v3: https://ui.nuxt.com/docs/getting-started/migration/v4
- Breaking changes documented in migration guide

### Issue: ESLint 9 Flat Config
- ESLint 9 uses new flat config format
- @nuxt/eslint 0.7.x supports it
- If issues arise, see: https://eslint.org/docs/latest/use/configure/migration-guide

### Issue: TypeScript Strict Mode
- Project uses strict: true in tsconfig
- Some third-party types may need @ts-expect-error comments
- This is intentional for better type safety
