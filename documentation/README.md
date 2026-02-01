# MetaPeek Documentation Index

This document serves as the entry point to all MetaPeek documentation.

---

## Design & Planning

### 📘 [metapeek-design-doc-final.md](./metapeek-design-doc-final.md)
**The primary design document.** Read this first.

- Complete technical specification
- Architecture decisions
- Security considerations
- All three development phases
- User stories
- Configuration approach

**Status:** Production-ready specification

---

## Pre-Development

### ✅ [pre-launch-checklist.md](./pre-launch-checklist.md)
**Complete checklist for all phases.**

- Phase 1 requirements (client-side MVP)
- Phase 2 requirements (live URL fetching)
- Phase 3 requirements (polish & power features)
- Accessibility verification steps
- Security testing checklist
- Deployment verification

**Use this:** Check off items as you complete them. Don't skip ahead.

---

### 🧪 [testing-strategy.md](./testing-strategy.md)
**Comprehensive testing approach.**

- Unit test examples (with code)
- Security test cases (SSRF, rate limiting)
- Accessibility testing procedures
- Integration testing
- Manual testing scripts
- CI/CD pipeline setup

**Use this:** Reference while writing tests. Aim for test coverage goals listed.

---

### ♿ [accessibility-guidelines.md](./accessibility-guidelines.md)
**WCAG 2.1 AA implementation guide.**

- Component-specific accessibility requirements
- ARIA patterns with code examples
- Keyboard navigation requirements
- Screen reader testing scripts
- Color contrast requirements
- Common violations and fixes

**Use this:** Reference while building every component. Accessibility is mandatory, not optional.

---

## Implementation

### 🚀 [phase-1-implementation-guide.md](./phase-1-implementation-guide.md)
**Step-by-step Phase 1 implementation.**

- Project initialization commands
- Configuration file setup
- Complete composable implementations (with code)
- Component structure
- Testing instructions
- Common issues and solutions

**Use this:** Follow sequentially when starting development.

---

### 📦 [initial-package-json.md](./initial-package-json.md)
**Dependency versions and installation.**

- Complete package.json with latest versions
- Installation instructions
- Dependency update guidelines
- Security audit procedures
- Known issues and workarounds

**Use this:** Copy package.json when initializing project. Reference for version updates.

---

## Documentation Usage by Phase

### Starting Phase 1

1. Read **design-doc-final.md** (at least sections 1-7, 10)
2. Review **accessibility-guidelines.md** (full document)
3. Follow **phase-1-implementation-guide.md** step-by-step
4. Use **initial-package-json.md** for setup
5. Reference **testing-strategy.md** while writing tests
6. Check off **pre-launch-checklist.md** Phase 1 items

### Starting Phase 2

1. Re-read **design-doc-final.md** sections 2-3 (Phase 2), 5, 9
2. Review **pre-launch-checklist.md** Phase 2 section
3. Implement security features with **testing-strategy.md** security tests
4. Verify rate limiting and SSRF protection
5. Test accessibility of new loading/error states

### Starting Phase 3

1. Review **design-doc-final.md** section 3 (Phase 3)
2. Follow **pre-launch-checklist.md** Phase 3 items
3. Maintain accessibility compliance
4. Add tests for new features

---

## Quick Reference

### Key Principles
- WCAG 2.1 AA accessibility is mandatory (not optional)
- Security-first (SSRF protection, rate limiting, input validation)
- All config in metapeek.config.ts (only secrets in env vars)
- Test everything security-related before deployment

### Critical Files
- `metapeek.config.ts` - Single source of truth for configuration
- `server/utils/proxy.ts` - Security utilities (validateUrl, extractHead)
- `composables/useMetaParser.ts` - Core parsing logic
- `composables/useDiagnostics.ts` - Tag validation

### Before Every Merge
- [ ] All tests passing
- [ ] axe DevTools reports zero violations
- [ ] Lighthouse accessibility score 100
- [ ] Keyboard-only navigation works
- [ ] Screen reader tested (NVDA or VoiceOver minimum)

### Before Production Deploy
- [ ] All Phase 1 & 2 checklist items complete
- [ ] Security tests passing (SSRF, rate limiting)
- [ ] Netlify timeout increase confirmed (26s)
- [ ] Rate limiting verified in deploy log
- [ ] Manual testing with real URLs complete

---

## Getting Help

### For Design Questions
- Reference **design-doc-final.md** sections
- Check "Resolved Decisions" (section 11) for answered questions
- Review "Must-Haves" and "Must-Avoids" (sections 7-8)

### For Implementation Questions
- **Phase 1:** phase-1-implementation-guide.md
- **Testing:** testing-strategy.md
- **Accessibility:** accessibility-guidelines.md

### For Security Questions
- Review design-doc section 9 (Proxy Architecture)
- Check testing-strategy.md security test section
- Verify against pre-launch checklist security items

---

## Document Maintenance

### Updating Documentation

When making changes to the codebase:

1. **Config changes:** Update metapeek.config.ts AND design-doc section 6
2. **New features:** Update design-doc, add to appropriate checklist
3. **Accessibility patterns:** Document in accessibility-guidelines.md
4. **Security changes:** Update design-doc section 9, add tests to testing-strategy.md
5. **Dependencies:** Update initial-package-json.md with version notes

### Documentation Review

Review all docs when:
- Starting a new phase
- After completing major features
- Before production deployment
- After significant architecture changes

---

## File Tree

```
documentation/
├── README.md (this file)
├── metapeek-design-doc-final.md      # Main design document
├── pre-launch-checklist.md           # Complete checklist
├── testing-strategy.md               # Testing approach
├── accessibility-guidelines.md       # WCAG 2.1 AA guide
├── phase-1-implementation-guide.md   # Implementation steps
└── initial-package-json.md           # Dependency versions
```

---

## Version History

- **v1.0** (Feb 2026): Initial documentation suite
  - Design doc finalized
  - All supporting docs created
  - Ready for Phase 1 development

---

## Next Steps

**You are ready to begin Phase 1 development.**

1. Create project directory
2. Copy package.json from initial-package-json.md
3. Run `npm install`
4. Follow phase-1-implementation-guide.md
5. Check off pre-launch-checklist.md items as you go

**Remember:** Accessibility and security are not optional. Test everything. The checklists are your friends.
