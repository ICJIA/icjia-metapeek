/**
 * @fileoverview Parses HTML and extracts meta tags, Open Graph, Twitter Card,
 * and structured data. Uses cheerio for isomorphic parsing (browser + Node).
 *
 * @module shared/parser
 */

import { load } from "cheerio";
import type { MetaTags } from "./types";

/**
 * Parses HTML string and extracts all meta tags into a structured object.
 *
 * @param html - HTML string (full document or head section)
 * @returns MetaTags object with title, description, og, twitter, etc.
 */
export function parseMetaTags(html: string): MetaTags {
  const $ = load(html);

  // Helper to get meta content by selector
  const getMeta = (selector: string): string | undefined => {
    const val = $(selector).first().attr("content");
    return val || undefined;
  };

  // Helper to get all values for a meta tag (for article:tag which can have multiple)
  const getMetaAll = (selector: string): string[] => {
    return $(selector)
      .toArray()
      .map((el) => $(el).attr("content"))
      .filter((v): v is string => !!v);
  };

  // Extract title
  const title = $("title").first().text() || undefined;

  // Extract html lang attribute
  const htmlLang = $("html").attr("lang") || undefined;

  // Extract basic meta tags
  const description = getMeta('meta[name="description"]');
  const viewport = getMeta('meta[name="viewport"]');
  const robots = getMeta('meta[name="robots"]');
  const themeColor = getMeta('meta[name="theme-color"]');

  // Additional SEO meta tags
  const author = getMeta('meta[name="author"]');
  const keywords = getMeta('meta[name="keywords"]');
  const language =
    getMeta('meta[name="language"]') ||
    getMeta('meta[http-equiv="content-language"]');
  const generator = getMeta('meta[name="generator"]');

  // Extract canonical
  const canonical =
    $('link[rel="canonical"]').first().attr("href") || undefined;

  // Extract favicon
  const favicon =
    $('link[rel="icon"], link[rel="shortcut icon"]').first().attr("href") ||
    undefined;

  // Extract Open Graph tags
  const og = {
    title: getMeta('meta[property="og:title"]'),
    description: getMeta('meta[property="og:description"]'),
    type: getMeta('meta[property="og:type"]'),
    url: getMeta('meta[property="og:url"]'),
    image: getMeta('meta[property="og:image"]'),
    imageAlt: getMeta('meta[property="og:image:alt"]'),
    imageWidth: getMeta('meta[property="og:image:width"]'),
    imageHeight: getMeta('meta[property="og:image:height"]'),
    imageType: getMeta('meta[property="og:image:type"]'),
    siteName: getMeta('meta[property="og:site_name"]'),
    locale: getMeta('meta[property="og:locale"]'),
    updatedTime: getMeta('meta[property="og:updated_time"]'),
    video: getMeta('meta[property="og:video"]'),
    audio: getMeta('meta[property="og:audio"]'),
  };

  // Extract Facebook-specific tags
  const facebook = {
    appId: getMeta('meta[property="fb:app_id"]'),
    admins: getMeta('meta[property="fb:admins"]'),
  };

  // Extract Article tags (for og:type="article")
  const article = {
    author: getMeta('meta[property="article:author"]'),
    publishedTime: getMeta('meta[property="article:published_time"]'),
    modifiedTime: getMeta('meta[property="article:modified_time"]'),
    section: getMeta('meta[property="article:section"]'),
    tags: getMetaAll('meta[property="article:tag"]'),
  };

  // Extract Twitter Card tags
  const twitter = {
    card: getMeta('meta[name="twitter:card"]'),
    site: getMeta('meta[name="twitter:site"]'),
    creator: getMeta('meta[name="twitter:creator"]'),
    title: getMeta('meta[name="twitter:title"]'),
    description: getMeta('meta[name="twitter:description"]'),
    image: getMeta('meta[name="twitter:image"]'),
    imageAlt: getMeta('meta[name="twitter:image:alt"]'),
    label1: getMeta('meta[name="twitter:label1"]'),
    data1: getMeta('meta[name="twitter:data1"]'),
    label2: getMeta('meta[name="twitter:label2"]'),
    data2: getMeta('meta[name="twitter:data2"]'),
  };

  // Extract Pinterest tags
  const pinterest = {
    description:
      getMeta('meta[name="pinterest-rich-pin-description"]') ||
      getMeta('meta[name="pinterest:description"]'),
  };

  // Extract Apple/iOS tags
  const apple = {
    mobileWebAppCapable: getMeta(
      'meta[name="apple-mobile-web-app-capable"]',
    ),
    mobileWebAppTitle: getMeta('meta[name="apple-mobile-web-app-title"]'),
    mobileWebAppStatusBarStyle: getMeta(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
    ),
    touchIcon:
      $('link[rel="apple-touch-icon"]').first().attr("href") || undefined,
  };

  // Extract Microsoft tags
  const microsoft = {
    tileImage: getMeta('meta[name="msapplication-TileImage"]'),
    tileColor: getMeta('meta[name="msapplication-TileColor"]'),
  };

  // Extract JSON-LD structured data
  const structuredData: Array<Record<string, unknown>> = [];
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const data = JSON.parse($(script).html() || "");
      structuredData.push(data);
    } catch {
      // Invalid JSON - skip silently (expected for malformed pages)
    }
  });

  // SEO Insights — additional data for advisory checks
  const charset =
    $("meta[charset]").first().attr("charset") ||
    (() => {
      const ct = $('meta[http-equiv="Content-Type"]').first().attr("content");
      return ct?.match(/charset=([^\s;]+)/i)?.[1];
    })() ||
    undefined;

  const hreflangLinks: Array<{ lang: string; href: string }> = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr("hreflang");
    const href = $(el).attr("href");
    if (lang && href) hreflangLinks.push({ lang, href });
  });

  const preconnectHints: string[] = [];
  $('link[rel="preconnect"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) preconnectHints.push(href);
  });

  const dnsPrefetchHints: string[] = [];
  $('link[rel="dns-prefetch"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) dnsPrefetchHints.push(href);
  });

  const h1Tags: string[] = [];
  $("h1").each((_, el) => {
    const text = $(el).text().trim();
    if (text) h1Tags.push(text);
  });

  const duplicates = {
    title: $("title").length,
    description: $('meta[name="description"]').length,
    canonical: $('link[rel="canonical"]').length,
  };

  // Technology & analytics detection from scripts, links, and meta tags
  const scriptSrcs: string[] = [];
  const inlineScripts: string[] = [];
  $("script").each((_, el) => {
    const src = $(el).attr("src");
    if (src) scriptSrcs.push(src);
    const inline = $(el).html();
    if (inline) inlineScripts.push(inline);
  });

  const linkHrefs: string[] = [];
  $("link[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) linkHrefs.push(href);
  });

  const allSources = [...scriptSrcs, ...linkHrefs].join("\n");
  const allInline = inlineScripts.join("\n");

  // --- Technology detection ---
  const detectedTech: Array<{ name: string; category: string; evidence: string }> = [];
  const addTech = (name: string, category: string, evidence: string) => {
    if (!detectedTech.some((t) => t.name === name)) {
      detectedTech.push({ name, category, evidence });
    }
  };

  // Generator meta tag
  if (generator) {
    const gl = generator.toLowerCase();
    if (gl.includes("wordpress")) addTech("WordPress", "CMS", `<meta name="generator" content="${generator}">`);
    else if (gl.includes("drupal")) addTech("Drupal", "CMS", `<meta name="generator" content="${generator}">`);
    else if (gl.includes("joomla")) addTech("Joomla", "CMS", `<meta name="generator" content="${generator}">`);
    else if (gl.includes("hugo")) addTech("Hugo", "Static Site Generator", `<meta name="generator" content="${generator}">`);
    else if (gl.includes("jekyll")) addTech("Jekyll", "Static Site Generator", `<meta name="generator" content="${generator}">`);
    else if (gl.includes("ghost")) addTech("Ghost", "CMS", `<meta name="generator" content="${generator}">`);
    else if (gl.includes("wix")) addTech("Wix", "Website Builder", `<meta name="generator" content="${generator}">`);
    else if (gl.includes("squarespace")) addTech("Squarespace", "Website Builder", `<meta name="generator" content="${generator}">`);
    else if (gl.includes("webflow")) addTech("Webflow", "Website Builder", `<meta name="generator" content="${generator}">`);
    else addTech(generator, "Generator", `<meta name="generator" content="${generator}">`);
  }

  // Framework detection from scripts/links
  if (allSources.includes("/_next/") || allSources.includes("__next"))
    addTech("Next.js", "Framework", "Script/link pattern: /_next/");
  if (allSources.includes("/_nuxt/") || allSources.includes("/__nuxt"))
    addTech("Nuxt", "Framework", "Script/link pattern: /_nuxt/");
  if (allSources.includes("/gatsby-") || allSources.includes("gatsby.js"))
    addTech("Gatsby", "Framework", "Script pattern: gatsby");
  if (allSources.includes("astro"))
    addTech("Astro", "Framework", "Script/link pattern: astro");
  if (allSources.includes("svelte") || allSources.includes("sveltekit"))
    addTech("SvelteKit", "Framework", "Script pattern: svelte");
  if (allSources.includes("remix") && allSources.includes("__remix"))
    addTech("Remix", "Framework", "Script pattern: __remix");
  if (allSources.includes("angular") || $("app-root").length > 0)
    addTech("Angular", "Framework", "Script/element pattern: angular");

  // CDN / hosting detection
  if (allSources.includes("cdn.shopify.com") || allSources.includes("shopify"))
    addTech("Shopify", "E-Commerce", "CDN: cdn.shopify.com");
  if (allSources.includes("cdn.jsdelivr.net"))
    addTech("jsDelivr CDN", "CDN", "Link: cdn.jsdelivr.net");
  if (allSources.includes("cdnjs.cloudflare.com"))
    addTech("Cloudflare CDN", "CDN", "Link: cdnjs.cloudflare.com");
  if (allSources.includes("unpkg.com"))
    addTech("unpkg", "CDN", "Link: unpkg.com");

  // UI libraries
  if (allSources.includes("bootstrap"))
    addTech("Bootstrap", "CSS Framework", "Script/link pattern: bootstrap");
  if (allSources.includes("tailwindcss") || allSources.includes("tailwind"))
    addTech("Tailwind CSS", "CSS Framework", "Script/link pattern: tailwind");
  if (allSources.includes("jquery") || allInline.includes("jQuery"))
    addTech("jQuery", "Library", "Script pattern: jquery");
  if (allSources.includes("react") || $('[data-reactroot]').length > 0 || $('[id="__next"]').length > 0)
    addTech("React", "Library", "Script/element pattern: react");
  if (allSources.includes("vue") || $('[id="__nuxt"]').length > 0 || $('[id="app"][data-v-]').length > 0)
    addTech("Vue.js", "Library", "Script/element pattern: vue");

  // Fonts
  if (allSources.includes("fonts.googleapis.com") || allSources.includes("fonts.gstatic.com"))
    addTech("Google Fonts", "Fonts", "Link: fonts.googleapis.com");
  if (allSources.includes("use.typekit.net") || allSources.includes("p.typekit.net"))
    addTech("Adobe Fonts (Typekit)", "Fonts", "Link: use.typekit.net");

  // --- Analytics & tracking detection ---
  const detectedAnalytics: Array<{ name: string; evidence: string }> = [];
  const addAnalytics = (name: string, evidence: string) => {
    if (!detectedAnalytics.some((a) => a.name === name)) {
      detectedAnalytics.push({ name, evidence });
    }
  };

  // Google Analytics / GA4
  if (allSources.includes("googletagmanager.com/gtag") || allInline.includes("gtag("))
    addAnalytics("Google Analytics (GA4)", "Script: googletagmanager.com/gtag");
  else if (allSources.includes("google-analytics.com") || allInline.includes("ga("))
    addAnalytics("Google Analytics (Universal)", "Script: google-analytics.com");

  // Google Tag Manager
  if (allSources.includes("googletagmanager.com/gtm") || allInline.includes("GTM-"))
    addAnalytics("Google Tag Manager", "Script: googletagmanager.com/gtm");

  // Facebook Pixel
  if (allSources.includes("connect.facebook.net") || allInline.includes("fbq("))
    addAnalytics("Meta Pixel (Facebook)", "Script: connect.facebook.net / fbq()");

  // Hotjar
  if (allSources.includes("static.hotjar.com") || allInline.includes("hotjar") || allInline.includes("hj("))
    addAnalytics("Hotjar", "Script: static.hotjar.com");

  // Segment
  if (allSources.includes("cdn.segment.com") || allInline.includes("analytics.identify"))
    addAnalytics("Segment", "Script: cdn.segment.com");

  // Plausible
  if (allSources.includes("plausible.io"))
    addAnalytics("Plausible Analytics", "Script: plausible.io");

  // Fathom
  if (allSources.includes("cdn.usefathom.com") || allSources.includes("usefathom.com"))
    addAnalytics("Fathom Analytics", "Script: usefathom.com");

  // Matomo / Piwik
  if (allSources.includes("matomo") || allInline.includes("_paq") || allSources.includes("piwik"))
    addAnalytics("Matomo (Piwik)", "Script pattern: matomo / _paq");

  // Clarity
  if (allSources.includes("clarity.ms") || allInline.includes("clarity"))
    addAnalytics("Microsoft Clarity", "Script: clarity.ms");

  // HubSpot
  if (allSources.includes("js.hs-scripts.com") || allSources.includes("js.hs-analytics.net") || allSources.includes("hubspot"))
    addAnalytics("HubSpot", "Script: js.hs-scripts.com");

  // LinkedIn Insight
  if (allSources.includes("snap.licdn.com") || allInline.includes("_linkedin_partner_id"))
    addAnalytics("LinkedIn Insight Tag", "Script: snap.licdn.com");

  // Twitter/X Pixel
  if (allSources.includes("static.ads-twitter.com") || allInline.includes("twq("))
    addAnalytics("X (Twitter) Pixel", "Script: ads-twitter.com / twq()");

  // Pinterest Tag
  if (allSources.includes("pintrk") || allInline.includes("pintrk"))
    addAnalytics("Pinterest Tag", "Script pattern: pintrk");

  // TikTok Pixel
  if (allSources.includes("analytics.tiktok.com") || allInline.includes("ttq"))
    addAnalytics("TikTok Pixel", "Script: analytics.tiktok.com");

  // Vercel Analytics
  if (allSources.includes("vercel-analytics") || allSources.includes("_vercel/insights"))
    addAnalytics("Vercel Analytics", "Script: _vercel/insights");

  // Google Ads
  if (allSources.includes("googleads") || allInline.includes("google_conversion_id"))
    addAnalytics("Google Ads", "Script pattern: googleads");

  const seoInsights = {
    charset,
    hreflangLinks,
    preconnectHints,
    dnsPrefetchHints,
    h1Tags,
    duplicates,
    detectedTech,
    detectedAnalytics,
  };

  return {
    title,
    description,
    viewport,
    robots,
    canonical,
    favicon,
    themeColor,
    author,
    keywords,
    language,
    generator,
    htmlLang,
    og,
    facebook,
    article,
    twitter,
    pinterest,
    apple,
    microsoft,
    structuredData,
    seoInsights,
  };
}
