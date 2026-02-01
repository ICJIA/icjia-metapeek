<script setup lang="ts">
import type { MetaTags, Diagnostics } from '~/types/meta'

const colorMode = useColorMode()
const { parseMetaTags } = useMetaParser()
const { generateDiagnostics } = useDiagnostics()

// Fix orphaned ARIA live regions by moving them into a landmark
onMounted(() => {
  const mainContent = document.getElementById('main-content')
  if (mainContent) {
    // Find orphaned alert/live region elements outside landmarks
    const orphanedAlerts = document.querySelectorAll('body > [role="alert"], body > [aria-live]')
    orphanedAlerts.forEach(el => {
      // Move to end of main content
      mainContent.appendChild(el)
    })
  }
})

const inputHtml = ref('')
const parsedTags = ref<MetaTags | null>(null)
const diagnostics = ref<Diagnostics | null>(null)
const hasAnalyzed = ref(false)
const activeTab = ref('diagnostics')

const analyze = () => {
  if (!inputHtml.value.trim()) {
    parsedTags.value = null
    diagnostics.value = null
    hasAnalyzed.value = false
    return
  }
  
  parsedTags.value = parseMetaTags(inputHtml.value)
  diagnostics.value = generateDiagnostics(parsedTags.value)
  hasAnalyzed.value = true
}

// Auto-analyze with fast debounce for snappy feel
const debouncedAnalyze = useDebounceFn(analyze, 300)
watch(inputHtml, () => {
  if (inputHtml.value.trim()) {
    debouncedAnalyze()
  } else {
    parsedTags.value = null
    diagnostics.value = null
    hasAnalyzed.value = false
  }
})

// Sample HTML
const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitHub · Build and ship software on a single, collaborative platform</title>
  <meta name="description" content="Join the world's most widely adopted AI-powered developer platform where millions of developers, businesses, and the largest open source community build software that advances humanity.">
  
  <!-- Open Graph -->
  <meta property="og:site_name" content="GitHub">
  <meta property="og:type" content="website">
  <meta property="og:title" content="GitHub · Build and ship software on a single, collaborative platform">
  <meta property="og:url" content="https://github.com/">
  <meta property="og:description" content="Join the world's most widely adopted AI-powered developer platform where millions of developers, businesses, and the largest open source community build software.">
  <meta property="og:image" content="https://github.githubassets.com/assets/github-logo-55c5b9a1fe52.png">
  
  <!-- X (Twitter) -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@github">
  <meta name="twitter:title" content="GitHub">
  <meta name="twitter:description" content="Build and ship software on a single, collaborative platform.">
  <meta name="twitter:image" content="https://github.githubassets.com/assets/github-logo-55c5b9a1fe52.png">
  
  <link rel="canonical" href="https://github.com/">
  <link rel="icon" href="https://github.githubassets.com/favicons/favicon.svg">
</head>
<body>
  <h1>Welcome to GitHub</h1>
</body>
</html>`

const loadSample = () => {
  inputHtml.value = sampleHtml
}

const clearInput = () => {
  inputHtml.value = ''
}

// Tab items for results
const tabs = [
  { label: 'Previews', value: 'previews', icon: 'i-heroicons-eye' },
  { label: 'Diagnostics', value: 'diagnostics', icon: 'i-heroicons-clipboard-document-check' },
  { label: 'Code', value: 'code', icon: 'i-heroicons-code-bracket' }
]

// Export functionality
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Clipboard copy with notification
const copiedState = ref<string | null>(null)
const copyToClipboard = async (content: string, type: string) => {
  try {
    await navigator.clipboard.writeText(content)
    copiedState.value = type
    setTimeout(() => {
      copiedState.value = null
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// Extract head section from HTML for reference
const extractHeadSection = () => {
  const html = inputHtml.value
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  if (headMatch) {
    return headMatch[0]
  }
  // If no head tags, return the whole input (might be just meta tags)
  return html.trim()
}

const generateExportData = () => {
  if (!parsedTags.value || !diagnostics.value) return null
  
  const timestamp = new Date().toISOString()
  const tags = parsedTags.value
  const diag = diagnostics.value
  const originalHtml = extractHeadSection()
  
  return {
    exportInfo: {
      tool: 'MetaPeek by ICJIA',
      version: '1.0.0',
      exportedAt: timestamp,
      toolUrl: 'https://metapeek.icjia.dev',
      sourceType: 'html_paste', // Will be 'url_fetch' in Phase 2
      sourceUrl: null // Will contain URL in Phase 2
    },
    originalHtml: originalHtml,
    summary: {
      overallStatus: diag.overall.status,
      overallMessage: diag.overall.message,
      suggestion: diag.overall.suggestion,
      issueCount: [diag.title, diag.description, diag.ogTags, diag.ogImage, diag.twitterCard, diag.canonical, diag.robots]
        .filter(d => d.status !== 'green').length,
      passCount: [diag.title, diag.description, diag.ogTags, diag.ogImage, diag.twitterCard, diag.canonical, diag.robots]
        .filter(d => d.status === 'green').length
    },
    diagnostics: {
      title: { status: diag.title.status, message: diag.title.message, value: tags.title, charCount: tags.title?.length, limit: 60 },
      description: { status: diag.description.status, message: diag.description.message, value: tags.description, charCount: tags.description?.length, limit: 160 },
      canonical: { status: diag.canonical.status, message: diag.canonical.message, value: tags.canonical },
      robots: { status: diag.robots.status, message: diag.robots.message, value: tags.robots },
      ogTags: { status: diag.ogTags.status, message: diag.ogTags.message },
      ogImage: { status: diag.ogImage.status, message: diag.ogImage.message, value: tags.og?.image },
      twitterCard: { status: diag.twitterCard.status, message: diag.twitterCard.message }
    },
    metaTags: {
      basic: {
        title: tags.title,
        description: tags.description,
        canonical: tags.canonical,
        robots: tags.robots,
        viewport: tags.viewport,
        themeColor: tags.themeColor,
        favicon: tags.favicon,
        author: tags.author,
        keywords: tags.keywords,
        language: tags.language,
        generator: tags.generator
      },
      openGraph: {
        title: tags.og?.title,
        description: tags.og?.description,
        type: tags.og?.type,
        url: tags.og?.url,
        image: tags.og?.image,
        imageAlt: tags.og?.imageAlt,
        imageWidth: tags.og?.imageWidth,
        imageHeight: tags.og?.imageHeight,
        imageType: tags.og?.imageType,
        siteName: tags.og?.siteName,
        locale: tags.og?.locale,
        updatedTime: tags.og?.updatedTime,
        video: tags.og?.video,
        audio: tags.og?.audio
      },
      twitter: {
        card: tags.twitter?.card,
        site: tags.twitter?.site,
        creator: tags.twitter?.creator,
        title: tags.twitter?.title,
        description: tags.twitter?.description,
        image: tags.twitter?.image,
        imageAlt: tags.twitter?.imageAlt,
        label1: tags.twitter?.label1,
        data1: tags.twitter?.data1,
        label2: tags.twitter?.label2,
        data2: tags.twitter?.data2
      },
      facebook: {
        appId: tags.facebook?.appId,
        admins: tags.facebook?.admins
      },
      article: {
        author: tags.article?.author,
        publishedTime: tags.article?.publishedTime,
        modifiedTime: tags.article?.modifiedTime,
        section: tags.article?.section,
        tags: tags.article?.tags
      },
      pinterest: {
        description: tags.pinterest?.description
      },
      apple: {
        mobileWebAppCapable: tags.apple?.mobileWebAppCapable,
        mobileWebAppTitle: tags.apple?.mobileWebAppTitle,
        mobileWebAppStatusBarStyle: tags.apple?.mobileWebAppStatusBarStyle,
        touchIcon: tags.apple?.touchIcon
      },
      microsoft: {
        tileImage: tags.microsoft?.tileImage,
        tileColor: tags.microsoft?.tileColor
      },
      structuredData: tags.structuredData
    }
  }
}

const exportAsJson = () => {
  const data = generateExportData()
  if (!data) return
  
  const json = JSON.stringify(data, null, 2)
  const filename = `metapeek-results-${new Date().toISOString().split('T')[0]}.json`
  downloadFile(json, filename, 'application/json')
}

const generateMarkdownContent = () => {
  const data = generateExportData()
  if (!data) return null
  
  const tags = parsedTags.value!
  const diag = diagnostics.value!
  const originalHtml = extractHeadSection()
  
  const statusEmoji = (status: string) => status === 'green' ? '✅' : status === 'yellow' ? '⚠️' : '❌'
  
  let md = `# MetaPeek Analysis Results

**Exported:** ${new Date().toLocaleString()}  
**Tool:** MetaPeek by ICJIA (https://metapeek.icjia.dev)  
**Source:** HTML paste (URL fetch coming in Phase 2)

---

## Summary

**Overall Status:** ${statusEmoji(diag.overall.status)} ${diag.overall.message}  
**Checks Passed:** ${data.summary.passCount}/7  
**Issues Found:** ${data.summary.issueCount}
${diag.overall.suggestion ? `\n**Suggestion:** ${diag.overall.suggestion}` : ''}

---

## Diagnostic Results

| Check | Status | Details |
|-------|--------|---------|
| Title | ${statusEmoji(diag.title.status)} | ${diag.title.message} |
| Description | ${statusEmoji(diag.description.status)} | ${diag.description.message} |
| Open Graph | ${statusEmoji(diag.ogTags.status)} | ${diag.ogTags.message} |
| OG Image | ${statusEmoji(diag.ogImage.status)} | ${diag.ogImage.message} |
| X/Twitter Card | ${statusEmoji(diag.twitterCard.status)} | ${diag.twitterCard.message} |
| Canonical URL | ${statusEmoji(diag.canonical.status)} | ${diag.canonical.message} |
| Robots | ${statusEmoji(diag.robots.status)} | ${diag.robots.message} |

---

## Basic Meta Tags

| Tag | Value |
|-----|-------|
| Title | ${tags.title || '(not set)'} |
| Title Length | ${tags.title?.length || 0}/60 characters |
| Description | ${tags.description || '(not set)'} |
| Description Length | ${tags.description?.length || 0}/160 characters |
| Canonical URL | ${tags.canonical || '(not set)'} |
| Robots | ${tags.robots || '(not set)'} |
${tags.author ? `| Author | ${tags.author} |` : ''}
${tags.keywords ? `| Keywords | ${tags.keywords} |` : ''}
${tags.language ? `| Language | ${tags.language} |` : ''}
${tags.viewport ? `| Viewport | ${tags.viewport} |` : ''}
${tags.themeColor ? `| Theme Color | ${tags.themeColor} |` : ''}
${tags.favicon ? `| Favicon | ${tags.favicon} |` : ''}

---

## Open Graph Tags

| Property | Value |
|----------|-------|
| og:title | ${tags.og?.title || '(not set)'} |
| og:description | ${tags.og?.description || '(not set)'} |
| og:type | ${tags.og?.type || '(not set)'} |
| og:url | ${tags.og?.url || '(not set)'} |
| og:image | ${tags.og?.image || '(not set)'} |
${tags.og?.imageAlt ? `| og:image:alt | ${tags.og.imageAlt} |` : ''}
${tags.og?.imageWidth ? `| og:image:width | ${tags.og.imageWidth} |` : ''}
${tags.og?.imageHeight ? `| og:image:height | ${tags.og.imageHeight} |` : ''}
${tags.og?.siteName ? `| og:site_name | ${tags.og.siteName} |` : ''}
${tags.og?.locale ? `| og:locale | ${tags.og.locale} |` : ''}
${tags.og?.updatedTime ? `| og:updated_time | ${tags.og.updatedTime} |` : ''}

---

## X/Twitter Card Tags

| Property | Value |
|----------|-------|
| twitter:card | ${tags.twitter?.card || '(not set)'} |
| twitter:site | ${tags.twitter?.site || '(not set)'} |
${tags.twitter?.creator ? `| twitter:creator | ${tags.twitter.creator} |` : ''}
${tags.twitter?.title ? `| twitter:title | ${tags.twitter.title} |` : ''}
${tags.twitter?.description ? `| twitter:description | ${tags.twitter.description} |` : ''}
${tags.twitter?.image ? `| twitter:image | ${tags.twitter.image} |` : ''}
${tags.twitter?.imageAlt ? `| twitter:image:alt | ${tags.twitter.imageAlt} |` : ''}
${tags.twitter?.label1 ? `| twitter:label1 | ${tags.twitter.label1} |` : ''}
${tags.twitter?.data1 ? `| twitter:data1 | ${tags.twitter.data1} |` : ''}
`

  // Add Facebook section if present
  if (tags.facebook?.appId || tags.facebook?.admins) {
    md += `
---

## Facebook Tags

| Property | Value |
|----------|-------|
${tags.facebook?.appId ? `| fb:app_id | ${tags.facebook.appId} |` : ''}
${tags.facebook?.admins ? `| fb:admins | ${tags.facebook.admins} |` : ''}
`
  }

  // Add Article section if present
  if (tags.article?.author || tags.article?.publishedTime || tags.article?.section) {
    md += `
---

## Article Metadata

| Property | Value |
|----------|-------|
${tags.article?.author ? `| article:author | ${tags.article.author} |` : ''}
${tags.article?.publishedTime ? `| article:published_time | ${tags.article.publishedTime} |` : ''}
${tags.article?.modifiedTime ? `| article:modified_time | ${tags.article.modifiedTime} |` : ''}
${tags.article?.section ? `| article:section | ${tags.article.section} |` : ''}
${tags.article?.tags?.length ? `| article:tag | ${tags.article.tags.join(', ')} |` : ''}
`
  }

  // Add Structured Data if present
  if (tags.structuredData?.length) {
    md += `
---

## Structured Data (JSON-LD)

Found ${tags.structuredData.length} schema(s):

`
    tags.structuredData.forEach((schema, i) => {
      md += `### Schema ${i + 1}: ${schema['@type'] || 'Unknown'}

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

`
    })
  }

  md += `
---

## Issues to Fix

`
  
  // List issues
  const issues: string[] = []
  if (diag.title.status === 'red') issues.push(`- ❌ **Title:** ${diag.title.message}`)
  if (diag.title.status === 'yellow') issues.push(`- ⚠️ **Title:** ${diag.title.message}`)
  if (diag.description.status === 'red') issues.push(`- ❌ **Description:** ${diag.description.message}`)
  if (diag.description.status === 'yellow') issues.push(`- ⚠️ **Description:** ${diag.description.message}`)
  if (diag.ogTags.status === 'red') issues.push(`- ❌ **Open Graph:** ${diag.ogTags.message}`)
  if (diag.ogTags.status === 'yellow') issues.push(`- ⚠️ **Open Graph:** ${diag.ogTags.message}`)
  if (diag.ogImage.status === 'red') issues.push(`- ❌ **OG Image:** ${diag.ogImage.message}`)
  if (diag.ogImage.status === 'yellow') issues.push(`- ⚠️ **OG Image:** ${diag.ogImage.message}`)
  if (diag.twitterCard.status === 'red') issues.push(`- ❌ **X/Twitter:** ${diag.twitterCard.message}`)
  if (diag.twitterCard.status === 'yellow') issues.push(`- ⚠️ **X/Twitter:** ${diag.twitterCard.message}`)
  if (diag.canonical.status === 'red') issues.push(`- ❌ **Canonical:** ${diag.canonical.message}`)
  if (diag.canonical.status === 'yellow') issues.push(`- ⚠️ **Canonical:** ${diag.canonical.message}`)
  
  if (issues.length === 0) {
    md += `✅ No issues found! All meta tags are properly configured.\n`
  } else {
    md += issues.join('\n') + '\n'
  }

  md += `
---

## Original HTML Source

The following HTML was analyzed:

\`\`\`html
${originalHtml}
\`\`\`

---

*Generated by [MetaPeek](https://metapeek.icjia.dev) - Open Graph & Social Sharing Meta Tag Analyzer*
`

  return md
}

const exportAsMarkdown = () => {
  const md = generateMarkdownContent()
  if (!md) return
  const filename = `metapeek-results-${new Date().toISOString().split('T')[0]}.md`
  downloadFile(md, filename, 'text/markdown')
}

const copyMarkdownToClipboard = () => {
  const md = generateMarkdownContent()
  if (!md) return
  copyToClipboard(md, 'markdown')
}

const copyJsonToClipboard = () => {
  const data = generateExportData()
  if (!data) return
  const json = JSON.stringify(data, null, 2)
  copyToClipboard(json, 'json')
}

const exportAsHtml = () => {
  const data = generateExportData()
  if (!data) return
  
  const tags = parsedTags.value!
  const diag = diagnostics.value!
  const originalHtml = extractHeadSection()
  
  const statusColor = (status: string) => status === 'green' ? '#10b981' : status === 'yellow' ? '#f59e0b' : '#ef4444'
  const statusBg = (status: string) => status === 'green' ? '#d1fae5' : status === 'yellow' ? '#fef3c7' : '#fee2e2'
  const statusEmoji = (status: string) => status === 'green' ? '✅' : status === 'yellow' ? '⚠️' : '❌'
  
  const escapeHtml = (str: string | undefined) => {
    if (!str) return '(not set)'
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MetaPeek Analysis Report - ${new Date().toLocaleDateString()}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; background: #f9fafb; padding: 2rem; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 2rem; }
    .header h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    .header p { opacity: 0.9; font-size: 0.875rem; }
    .content { padding: 2rem; }
    .summary { padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; border: 2px solid; }
    .summary.green { background: #d1fae5; border-color: #10b981; }
    .summary.yellow { background: #fef3c7; border-color: #f59e0b; }
    .summary.red { background: #fee2e2; border-color: #ef4444; }
    .summary h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .stats { display: flex; gap: 2rem; margin-top: 1rem; }
    .stat { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; }
    .section { margin-bottom: 2rem; }
    .section h3 { font-size: 1.125rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e5e7eb; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; }
    td:first-child { font-weight: 500; color: #6b7280; width: 30%; }
    .status { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .status.green { background: #d1fae5; color: #065f46; }
    .status.yellow { background: #fef3c7; color: #92400e; }
    .status.red { background: #fee2e2; color: #991b1b; }
    .code-block { background: #1f2937; color: #e5e7eb; padding: 1rem; border-radius: 8px; overflow-x: auto; font-family: 'Monaco', 'Menlo', monospace; font-size: 0.75rem; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; }
    .footer { text-align: center; padding: 1.5rem; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #6b7280; }
    .value { font-family: 'Monaco', 'Menlo', monospace; font-size: 0.8rem; word-break: break-all; }
    .char-count { font-size: 0.7rem; color: #9ca3af; }
    .over-limit { color: #ef4444; font-weight: 600; }
    @media print { body { background: white; padding: 0; } .container { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 MetaPeek Analysis Report</h1>
      <p>Generated: ${new Date().toLocaleString()} | Tool: metapeek.icjia.dev</p>
    </div>
    
    <div class="content">
      <div class="summary ${diag.overall.status}">
        <h2>${statusEmoji(diag.overall.status)} ${diag.overall.message}</h2>
        ${diag.overall.suggestion ? `<p style="margin-top: 0.5rem; opacity: 0.8;">${diag.overall.suggestion}</p>` : ''}
        <div class="stats">
          <div class="stat">
            <div class="stat-value" style="color: #10b981;">${data.summary.passCount}</div>
            <div class="stat-label">Passed</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: #ef4444;">${data.summary.issueCount}</div>
            <div class="stat-label">Issues</div>
          </div>
        </div>
      </div>
      
      <div class="section">
        <h3>📋 Diagnostic Results</h3>
        <table>
          <tr><th>Check</th><th>Status</th><th>Details</th></tr>
          <tr><td>Title</td><td><span class="status ${diag.title.status}">${statusEmoji(diag.title.status)} ${diag.title.status === 'green' ? 'Pass' : diag.title.status === 'yellow' ? 'Warning' : 'Error'}</span></td><td>${diag.title.message}</td></tr>
          <tr><td>Description</td><td><span class="status ${diag.description.status}">${statusEmoji(diag.description.status)} ${diag.description.status === 'green' ? 'Pass' : diag.description.status === 'yellow' ? 'Warning' : 'Error'}</span></td><td>${diag.description.message}</td></tr>
          <tr><td>Open Graph</td><td><span class="status ${diag.ogTags.status}">${statusEmoji(diag.ogTags.status)} ${diag.ogTags.status === 'green' ? 'Pass' : diag.ogTags.status === 'yellow' ? 'Warning' : 'Error'}</span></td><td>${diag.ogTags.message}</td></tr>
          <tr><td>OG Image</td><td><span class="status ${diag.ogImage.status}">${statusEmoji(diag.ogImage.status)} ${diag.ogImage.status === 'green' ? 'Pass' : diag.ogImage.status === 'yellow' ? 'Warning' : 'Error'}</span></td><td>${diag.ogImage.message}</td></tr>
          <tr><td>X/Twitter Card</td><td><span class="status ${diag.twitterCard.status}">${statusEmoji(diag.twitterCard.status)} ${diag.twitterCard.status === 'green' ? 'Pass' : diag.twitterCard.status === 'yellow' ? 'Warning' : 'Error'}</span></td><td>${diag.twitterCard.message}</td></tr>
          <tr><td>Canonical URL</td><td><span class="status ${diag.canonical.status}">${statusEmoji(diag.canonical.status)} ${diag.canonical.status === 'green' ? 'Pass' : diag.canonical.status === 'yellow' ? 'Warning' : 'Error'}</span></td><td>${diag.canonical.message}</td></tr>
          <tr><td>Robots</td><td><span class="status ${diag.robots.status}">${statusEmoji(diag.robots.status)} ${diag.robots.status === 'green' ? 'Pass' : diag.robots.status === 'yellow' ? 'Warning' : 'Error'}</span></td><td>${diag.robots.message}</td></tr>
        </table>
      </div>
      
      <div class="section">
        <h3>📝 Basic Meta Tags</h3>
        <table>
          <tr><td>Title</td><td><span class="value">${escapeHtml(tags.title)}</span> <span class="char-count ${(tags.title?.length || 0) > 60 ? 'over-limit' : ''}">(${tags.title?.length || 0}/60 chars)</span></td></tr>
          <tr><td>Description</td><td><span class="value">${escapeHtml(tags.description)}</span> <span class="char-count ${(tags.description?.length || 0) > 160 ? 'over-limit' : ''}">(${tags.description?.length || 0}/160 chars)</span></td></tr>
          <tr><td>Canonical URL</td><td><span class="value">${escapeHtml(tags.canonical)}</span></td></tr>
          <tr><td>Robots</td><td><span class="value">${escapeHtml(tags.robots)}</span></td></tr>
          ${tags.author ? `<tr><td>Author</td><td><span class="value">${escapeHtml(tags.author)}</span></td></tr>` : ''}
          ${tags.keywords ? `<tr><td>Keywords</td><td><span class="value">${escapeHtml(tags.keywords)}</span></td></tr>` : ''}
          ${tags.viewport ? `<tr><td>Viewport</td><td><span class="value">${escapeHtml(tags.viewport)}</span></td></tr>` : ''}
          ${tags.themeColor ? `<tr><td>Theme Color</td><td><span style="display:inline-block;width:16px;height:16px;background:${tags.themeColor};border:1px solid #ccc;border-radius:3px;vertical-align:middle;margin-right:8px;"></span><span class="value">${escapeHtml(tags.themeColor)}</span></td></tr>` : ''}
        </table>
      </div>
      
      <div class="section">
        <h3>🌐 Open Graph Tags</h3>
        <table>
          <tr><td>og:title</td><td><span class="value">${escapeHtml(tags.og?.title)}</span></td></tr>
          <tr><td>og:description</td><td><span class="value">${escapeHtml(tags.og?.description)}</span></td></tr>
          <tr><td>og:type</td><td><span class="value">${escapeHtml(tags.og?.type)}</span></td></tr>
          <tr><td>og:url</td><td><span class="value">${escapeHtml(tags.og?.url)}</span></td></tr>
          <tr><td>og:image</td><td><span class="value">${escapeHtml(tags.og?.image)}</span></td></tr>
          ${tags.og?.imageAlt ? `<tr><td>og:image:alt</td><td><span class="value">${escapeHtml(tags.og.imageAlt)}</span></td></tr>` : ''}
          ${tags.og?.imageWidth ? `<tr><td>og:image:width</td><td><span class="value">${escapeHtml(tags.og.imageWidth)}</span></td></tr>` : ''}
          ${tags.og?.imageHeight ? `<tr><td>og:image:height</td><td><span class="value">${escapeHtml(tags.og.imageHeight)}</span></td></tr>` : ''}
          ${tags.og?.siteName ? `<tr><td>og:site_name</td><td><span class="value">${escapeHtml(tags.og.siteName)}</span></td></tr>` : ''}
          ${tags.og?.locale ? `<tr><td>og:locale</td><td><span class="value">${escapeHtml(tags.og.locale)}</span></td></tr>` : ''}
        </table>
      </div>
      
      <div class="section">
        <h3>🐦 X/Twitter Card Tags</h3>
        <table>
          <tr><td>twitter:card</td><td><span class="value">${escapeHtml(tags.twitter?.card)}</span></td></tr>
          <tr><td>twitter:site</td><td><span class="value">${escapeHtml(tags.twitter?.site)}</span></td></tr>
          ${tags.twitter?.creator ? `<tr><td>twitter:creator</td><td><span class="value">${escapeHtml(tags.twitter.creator)}</span></td></tr>` : ''}
          ${tags.twitter?.title ? `<tr><td>twitter:title</td><td><span class="value">${escapeHtml(tags.twitter.title)}</span></td></tr>` : ''}
          ${tags.twitter?.description ? `<tr><td>twitter:description</td><td><span class="value">${escapeHtml(tags.twitter.description)}</span></td></tr>` : ''}
          ${tags.twitter?.image ? `<tr><td>twitter:image</td><td><span class="value">${escapeHtml(tags.twitter.image)}</span></td></tr>` : ''}
        </table>
      </div>
      
      ${tags.structuredData?.length ? `
      <div class="section">
        <h3>📊 Structured Data (JSON-LD)</h3>
        <p style="margin-bottom: 1rem; color: #6b7280;">Found ${tags.structuredData.length} schema(s)</p>
        ${tags.structuredData.map((schema, i) => `
          <p style="font-weight: 600; margin-bottom: 0.5rem;">Schema ${i + 1}: ${schema['@type'] || 'Unknown'}</p>
          <pre class="code-block">${escapeHtml(JSON.stringify(schema, null, 2))}</pre>
        `).join('')}
      </div>
      ` : ''}
      
      <div class="section">
        <h3>📄 Original HTML Source</h3>
        <pre class="code-block">${escapeHtml(originalHtml)}</pre>
      </div>
    </div>
    
    <div class="footer">
      Generated by <strong>MetaPeek</strong> — Open Graph & Social Sharing Meta Tag Analyzer<br>
      <a href="https://metapeek.icjia.dev" style="color: #3b82f6;">metapeek.icjia.dev</a> | 
      Built by <a href="https://icjia.illinois.gov" style="color: #3b82f6;">ICJIA</a>
    </div>
  </div>
</body>
</html>`

  const filename = `metapeek-report-${new Date().toISOString().split('T')[0]}.html`
  downloadFile(html, filename, 'text/html')
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
    <!-- Skip link for keyboard users -->
    <a href="#main-content" class="skip-link">Skip to main content</a>
    
    <!-- Header -->
    <header class="sticky top-0 z-50 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
      <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <img 
              src="~/assets/images/icjia-logo.png" 
              alt="ICJIA Logo" 
              class="h-8 w-auto"
            />
            <span class="text-xl font-bold tracking-tight">MetaPeek</span>
            <span class="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">Beta</span>
          </div>
          <div class="flex items-center gap-1">
            <ClientOnly>
              <button
                @click="colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'"
                class="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
                :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
              >
                <UIcon 
                  :name="colorMode.value === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'" 
                  class="w-5 h-5 text-gray-600 dark:text-gray-400"
                  aria-hidden="true"
                />
              </button>
              <template #fallback><div class="w-9 h-9" aria-hidden="true" /></template>
            </ClientOnly>
            <a
              href="https://github.com/ICJIA/icjia-metapeek"
              target="_blank"
              rel="noopener"
              class="p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="View on GitHub"
            >
              <UIcon name="i-simple-icons-github" class="w-5 h-5 text-gray-600 dark:text-gray-400" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </header>

    <main id="main-content" class="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <!-- Hero Section -->
      <div class="mb-8">
        <p class="text-sm text-gray-600 dark:text-gray-300 uppercase tracking-wider font-medium mb-2">
          Open Graph &amp; Social Share Debugger
        </p>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          Preview how your links appear when shared
        </h1>
        
        <!-- Two-column layout on larger screens -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          <div class="space-y-2">
            <p class="text-gray-700 dark:text-gray-300">
              When you share a link on social media, platforms display a preview card with a title, image, and description. 
              This comes from <span class="font-medium text-gray-900 dark:text-white">Open Graph tags</span> in your HTML.
            </p>
            <p class="text-gray-600 dark:text-gray-400 text-sm">
              Missing or broken tags = unprofessional previews that people scroll past.
            </p>
          </div>
          <div class="space-y-2">
            <p class="text-gray-700 dark:text-gray-300">
              <span class="font-medium text-gray-900 dark:text-white">MetaPeek</span> shows you exactly what each platform will display, 
              diagnoses problems, and gives you the code to fix them.
            </p>
            <p class="text-gray-500 dark:text-gray-400 text-sm italic">
              "Peek" at your meta tags — the hidden HTML controlling your social presence.
            </p>
          </div>
        </div>
      </div>

    <!-- Step 1: Input Section -->
    <div class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-blue-50 dark:bg-blue-950/40 border-y border-blue-200 dark:border-blue-800">
      <div class="flex items-center gap-4 mb-6">
        <div class="flex items-center justify-center w-24 h-24 rounded-full bg-blue-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-blue-200 dark:ring-blue-800">
          1
        </div>
        <div>
          <label for="html-input" class="text-2xl font-bold text-gray-900 dark:text-white block">
            Paste Your HTML
          </label>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Paste your page's source code (or just the &lt;head&gt; section)
          </p>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <UButton
            v-if="inputHtml.trim()"
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-x-mark"
            @click="clearInput"
          >
            Clear
          </UButton>
          <UButton
            size="sm"
            variant="soft"
            color="primary"
            icon="i-heroicons-document-duplicate"
            @click="loadSample"
          >
            Load Example
          </UButton>
        </div>
      </div>
      
      <div class="relative">
        <textarea
          id="html-input"
          v-model="inputHtml"
          rows="8"
          placeholder="Right-click on your webpage → 'View Page Source' → Copy and paste here..."
          class="w-full px-4 py-3 rounded-xl border-0 bg-white dark:bg-gray-900 
                 ring-1 ring-gray-200 dark:ring-gray-700 
                 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                 font-mono text-sm leading-relaxed
                 placeholder:text-gray-400 dark:placeholder:text-gray-500
                 resize-none transition-shadow duration-150
                 shadow-sm"
          spellcheck="false"
        />
        
        <!-- Status indicator -->
        <div class="absolute bottom-3 right-3 flex items-center gap-3 text-xs">
          <span class="text-gray-400 dark:text-gray-500 tabular-nums">
            {{ inputHtml.length.toLocaleString() }} chars
          </span>
          <span 
            v-if="hasAnalyzed" 
            class="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Analyzed
          </span>
        </div>
      </div>
    </div>

    <!-- Step 2: Image Analysis - Right after Step 1 -->
    <div v-if="parsedTags && diagnostics" class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-purple-50 dark:bg-purple-950/40 border-y border-purple-200 dark:border-purple-800">
      <div class="flex items-center gap-4 mb-6">
        <div class="flex items-center justify-center w-24 h-24 rounded-full bg-purple-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-purple-200 dark:ring-purple-800">
          2
        </div>
        <div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Image Size Check</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400">Will your og:image display correctly on each platform?</p>
        </div>
      </div>
      <ImageAnalysis :image-url="parsedTags.og.image" />
    </div>

    <!-- Step 3: Platform Previews -->
    <div v-if="parsedTags && diagnostics" class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-emerald-50 dark:bg-emerald-950/40 border-y border-emerald-200 dark:border-emerald-800">
      <div class="flex items-center gap-4 mb-6">
        <div class="flex items-center justify-center w-24 h-24 rounded-full bg-emerald-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-emerald-200 dark:ring-emerald-800">
          3
        </div>
        <div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Platform Preview</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400">See exactly how your links will appear when shared</p>
        </div>
      </div>
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PreviewGoogle 
          :title="parsedTags.og.title || parsedTags.title"
          :description="parsedTags.og.description || parsedTags.description"
          :url="parsedTags.og.url || parsedTags.canonical"
        />
        <PreviewFacebook
          :title="parsedTags.og.title"
          :description="parsedTags.og.description"
          :image="parsedTags.og.image"
        />
        <PreviewLinkedIn
          :title="parsedTags.og.title"
          :description="parsedTags.og.description"
          :image="parsedTags.og.image"
        />
        <PreviewTwitter
          :card="parsedTags.twitter.card"
          :title="parsedTags.twitter.title || parsedTags.og.title"
          :description="parsedTags.twitter.description || parsedTags.og.description"
          :image="parsedTags.twitter.image || parsedTags.og.image"
        />
        <PreviewSlack
          :title="parsedTags.og.title || parsedTags.title"
          :description="parsedTags.og.description || parsedTags.description"
          :image="parsedTags.og.image"
          :favicon="parsedTags.favicon"
          :url="parsedTags.og.url || parsedTags.canonical"
        />
      </div>
    </div>

    <!-- Step 4: Diagnostics & Code -->
    <div v-if="parsedTags && diagnostics" class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 bg-amber-50 dark:bg-amber-950/40 border-y border-amber-200 dark:border-amber-800">
      <div class="flex items-center gap-4 mb-6">
        <div class="flex items-center justify-center w-24 h-24 rounded-full bg-amber-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-amber-200 dark:ring-amber-800">
          4
        </div>
        <div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Meta Results and Suggestions</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400">Review diagnostics and get corrected HTML to copy</p>
        </div>
      </div>
      
      <!-- Tab Navigation -->
      <div class="border-b border-amber-200 dark:border-amber-800 mb-6">
        <nav class="flex gap-6" aria-label="Results tabs">
          <button
            v-for="tab in tabs.filter(t => t.value !== 'previews')"
            :key="tab.value"
            @click="activeTab = tab.value"
            :class="[
              'flex items-center gap-2 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.value 
                ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white' 
                : 'border-transparent text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            ]"
          >
            <UIcon :name="tab.icon" class="w-4 h-4" />
            {{ tab.label }}
            <UBadge 
              v-if="tab.value === 'diagnostics'" 
              :color="diagnostics.overall.status === 'green' ? 'success' : diagnostics.overall.status === 'yellow' ? 'warning' : 'error'"
              size="xs"
              variant="subtle"
            >
              {{ diagnostics.overall.status === 'green' ? '✓' : diagnostics.overall.status === 'yellow' ? '!' : '✕' }}
            </UBadge>
          </button>
        </nav>
      </div>

      <!-- Tab Panels -->
      <div class="min-h-[300px]">
        <!-- Diagnostics Tab -->
        <div v-show="activeTab === 'diagnostics'">
          <DiagnosticsPanel :diagnostics="diagnostics" :tags="parsedTags" />
        </div>

        <!-- Code Tab -->
        <div v-show="activeTab === 'code'">
          <CodeGenerator :tags="parsedTags" />
        </div>
      </div>
    </div>

    <!-- Step 5: Export Results -->
    <div v-if="parsedTags && diagnostics" class="-mx-4 sm:-mx-6 px-4 sm:px-6 py-8 mb-8 bg-cyan-50 dark:bg-cyan-950/40 border-y border-cyan-200 dark:border-cyan-800">
      <div class="flex items-center gap-4 mb-6">
        <div class="flex items-center justify-center w-24 h-24 rounded-full bg-cyan-600 text-white font-extrabold text-5xl shadow-xl ring-4 ring-cyan-200 dark:ring-cyan-800">
          5
        </div>
        <div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Export Results</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400">Save your analysis for documentation or LLM-assisted fixes</p>
        </div>
      </div>
      
      <div class="bg-white dark:bg-gray-900 rounded-lg border border-cyan-200 dark:border-cyan-800 p-6">
        <p class="text-gray-700 dark:text-gray-300 mb-6">
          Download your meta tag analysis to share with your team, include in documentation, or upload to an AI assistant (ChatGPT, Claude, etc.) for help implementing fixes. All exports include the original HTML source.
        </p>
        
        <!-- Download buttons -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4" />
            Download Files
          </h3>
          <div class="flex flex-wrap gap-3">
            <UButton
              @click="exportAsJson"
              size="lg"
              variant="soft"
              color="primary"
              icon="i-heroicons-code-bracket"
            >
              JSON
            </UButton>
            <UButton
              @click="exportAsMarkdown"
              size="lg"
              variant="soft"
              color="neutral"
              icon="i-heroicons-document-text"
            >
              Markdown
            </UButton>
            <UButton
              @click="exportAsHtml"
              size="lg"
              variant="soft"
              color="neutral"
              icon="i-heroicons-globe-alt"
            >
              HTML Report
            </UButton>
          </div>
        </div>
        
        <!-- Copy to clipboard buttons -->
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <UIcon name="i-heroicons-clipboard-document" class="w-4 h-4" />
            Copy to Clipboard
          </h3>
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              @click="copyMarkdownToClipboard"
              size="lg"
              variant="outline"
              color="neutral"
              icon="i-heroicons-clipboard-document"
            >
              Copy Markdown
            </UButton>
            <UButton
              @click="copyJsonToClipboard"
              size="lg"
              variant="outline"
              color="neutral"
              icon="i-heroicons-clipboard-document"
            >
              Copy JSON
            </UButton>
            
            <!-- Copied indicator -->
            <Transition
              enter-active-class="transition-all duration-200 ease-out"
              enter-from-class="opacity-0 translate-x-2"
              enter-to-class="opacity-100 translate-x-0"
              leave-active-class="transition-all duration-150 ease-in"
              leave-from-class="opacity-100 translate-x-0"
              leave-to-class="opacity-0 translate-x-2"
            >
              <span 
                v-if="copiedState" 
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-sm font-medium"
              >
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
                {{ copiedState === 'markdown' ? 'Markdown' : 'JSON' }} copied!
              </span>
            </Transition>
          </div>
        </div>
        
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <strong>💡 Tip:</strong> The Markdown format is ideal for pasting into LLMs — it includes all diagnostic details, current values, issues, and the original HTML source in a structured format that AI assistants can easily understand and act on.
        </p>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
        <UIcon name="i-heroicons-share" class="w-8 h-8 text-gray-400" />
      </div>
      <h2 class="text-lg font-semibold mb-2">Check how your website looks when shared</h2>
      <p class="text-gray-600 dark:text-gray-300 mb-3 max-w-lg">
        Paste your page's HTML above to see exactly what Facebook, LinkedIn, X, and other platforms 
        will display when someone shares your link.
      </p>
      <p class="text-gray-500 dark:text-gray-400 mb-5 max-w-lg text-sm">
        MetaPeek will identify any missing or incorrect tags and provide the exact code needed to fix them.
        <span class="block mt-1 text-xs">Not sure how to get your HTML? Right-click on your webpage and select "View Page Source."</span>
      </p>
      <UButton 
        @click="loadSample" 
        variant="soft"
        color="neutral"
        icon="i-heroicons-sparkles"
        size="md"
      >
        See an Example First
      </UButton>
    </div>

    <!-- Footer -->
    <footer class="mt-16 pt-6 border-t border-gray-200 dark:border-gray-800">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-gray-400">
        <p>
          Built by <a href="https://icjia.illinois.gov" class="underline hover:text-gray-900 dark:hover:text-gray-100 transition-colors inline-block py-2">ICJIA</a>
        </p>
        <p class="flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          No tracking · No ads · No account
        </p>
      </div>
    </footer>
  </main>
  </div>
</template>
