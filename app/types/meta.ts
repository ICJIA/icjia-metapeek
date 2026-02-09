/**
 * @fileoverview TypeScript types for meta tags and diagnostics.
 *
 * @module types/meta
 */

/**
 * Parsed meta tags from HTML. Includes standard meta, Open Graph, Twitter Card,
 * and structured data. Nested objects (og, twitter, etc.) are always present.
 */
export interface MetaTags {
  /** Basic meta tags */
  title?: string;
  description?: string;
  viewport?: string;
  robots?: string;
  canonical?: string;
  favicon?: string;
  themeColor?: string;

  // Additional SEO tags
  author?: string;
  keywords?: string;
  language?: string;
  generator?: string;

  // Open Graph tags
  og: {
    title?: string;
    description?: string;
    type?: string;
    url?: string;
    image?: string;
    imageAlt?: string;
    imageWidth?: string;
    imageHeight?: string;
    imageType?: string;
    siteName?: string;
    locale?: string;
    updatedTime?: string;
    video?: string;
    audio?: string;
  };

  // Facebook-specific tags
  facebook: {
    appId?: string;
    admins?: string;
  };

  // Article tags (for og:type="article")
  article: {
    author?: string;
    publishedTime?: string;
    modifiedTime?: string;
    section?: string;
    tags?: string[];
  };

  // Twitter/X Card tags
  twitter: {
    card?: string;
    site?: string;
    creator?: string;
    title?: string;
    description?: string;
    image?: string;
    imageAlt?: string;
    label1?: string;
    data1?: string;
    label2?: string;
    data2?: string;
  };

  // Pinterest tags
  pinterest: {
    description?: string;
  };

  // Apple/iOS tags
  apple: {
    mobileWebAppCapable?: string;
    mobileWebAppTitle?: string;
    mobileWebAppStatusBarStyle?: string;
    touchIcon?: string;
  };

  // Microsoft tags
  microsoft: {
    tileImage?: string;
    tileColor?: string;
  };

  // JSON-LD Structured Data
  structuredData: Array<Record<string, unknown>>;
}

/**
 * Result for a single diagnostic check (e.g. title, description).
 */
export interface DiagnosticResult {
  status: "green" | "yellow" | "red";
  icon: "check" | "warning" | "error";
  message: string;
  suggestion?: string;
}

/**
 * Full diagnostics for all meta tag categories plus overall status.
 */
export interface Diagnostics {
  overall: DiagnosticResult;
  title: DiagnosticResult;
  description: DiagnosticResult;
  ogTags: DiagnosticResult;
  ogImage: DiagnosticResult;
  twitterCard: DiagnosticResult;
  canonical: DiagnosticResult;
  robots: DiagnosticResult;
}
