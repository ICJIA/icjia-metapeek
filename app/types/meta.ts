// app/types/meta.ts

export interface MetaTags {
  title?: string
  description?: string
  viewport?: string
  robots?: string
  canonical?: string
  favicon?: string
  themeColor?: string
  
  og: {
    title?: string
    description?: string
    type?: string
    url?: string
    image?: string
    imageAlt?: string
    siteName?: string
    locale?: string
  }
  
  twitter: {
    card?: string
    site?: string
    creator?: string
    title?: string
    description?: string
    image?: string
    imageAlt?: string
  }
  
  structuredData: Array<Record<string, any>>
}

export interface DiagnosticResult {
  status: 'green' | 'yellow' | 'red'
  icon: 'check' | 'warning' | 'error'
  message: string
  suggestion?: string
}

export interface Diagnostics {
  overall: DiagnosticResult
  title: DiagnosticResult
  description: DiagnosticResult
  ogTags: DiagnosticResult
  ogImage: DiagnosticResult
  twitterCard: DiagnosticResult
  canonical: DiagnosticResult
  robots: DiagnosticResult
}
