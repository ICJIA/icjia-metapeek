// app/composables/useMetaParser.ts

import type { MetaTags } from "~/types/meta";

export const useMetaParser = () => {
  const parseMetaTags = (html: string): MetaTags => {
    // Use DOMParser (available in all modern browsers)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Helper to get meta content by selector
    const getMeta = (selector: string): string | undefined => {
      const element = doc.querySelector(selector);
      return element?.getAttribute("content") || undefined;
    };

    // Helper to get all values for a meta tag (for article:tag which can have multiple)
    const getMetaAll = (selector: string): string[] => {
      const elements = doc.querySelectorAll(selector);
      return Array.from(elements)
        .map((el) => el.getAttribute("content"))
        .filter((v): v is string => !!v);
    };

    // Extract title
    const title = doc.querySelector("title")?.textContent || undefined;

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
    const canonicalLink = doc.querySelector('link[rel="canonical"]');
    const canonical = canonicalLink?.getAttribute("href") || undefined;

    // Extract favicon
    const faviconLink = doc.querySelector(
      'link[rel="icon"], link[rel="shortcut icon"]',
    );
    const favicon = faviconLink?.getAttribute("href") || undefined;

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
    const appleTouchIcon = doc.querySelector('link[rel="apple-touch-icon"]');
    const apple = {
      mobileWebAppCapable: getMeta('meta[name="apple-mobile-web-app-capable"]'),
      mobileWebAppTitle: getMeta('meta[name="apple-mobile-web-app-title"]'),
      mobileWebAppStatusBarStyle: getMeta(
        'meta[name="apple-mobile-web-app-status-bar-style"]',
      ),
      touchIcon: appleTouchIcon?.getAttribute("href") || undefined,
    };

    // Extract Microsoft tags
    const microsoft = {
      tileImage: getMeta('meta[name="msapplication-TileImage"]'),
      tileColor: getMeta('meta[name="msapplication-TileColor"]'),
    };

    // Extract JSON-LD structured data
    const structuredData: Array<Record<string, unknown>> = [];
    const ldJsonScripts = doc.querySelectorAll(
      'script[type="application/ld+json"]',
    );

    ldJsonScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || "");
        structuredData.push(data);
      } catch {
        // Invalid JSON - skip silently (expected for malformed pages)
      }
    });

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
      og,
      facebook,
      article,
      twitter,
      pinterest,
      apple,
      microsoft,
      structuredData,
    };
  };

  return {
    parseMetaTags,
  };
};
