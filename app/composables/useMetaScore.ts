/**
 * @fileoverview Weighted scoring system for meta tags. Converts diagnostics
 * to a 0–100 score with letter grades (A–F). Uses Lighthouse-style methodology.
 *
 * @module composables/useMetaScore
 */

import type { Diagnostics } from '~/types/meta'

/**
 * Score and status for a single diagnostic category.
 */
export interface ScoreCategory {
  name: string
  score: number
  maxScore: number
  status: 'pass' | 'warning' | 'fail'
  weight: number
  issues: string[]
}

/**
 * Complete meta tag score with category breakdown and letter grade.
 */
export interface MetaScore {
  overall: number
  categories: {
    title: ScoreCategory
    description: ScoreCategory
    openGraph: ScoreCategory
    ogImage: ScoreCategory
    twitterCard: ScoreCategory
    canonical: ScoreCategory
    robots: ScoreCategory
  }
  totalIssues: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

/**
 * Category weights for weighted average. Must sum to 100.
 * OG and image tags have highest weight for social sharing impact.
 */
const WEIGHTS = {
  title: 15,          // 15% - Very important for SEO and social
  description: 15,    // 15% - Very important for SEO and social
  openGraph: 25,      // 25% - Critical for social sharing
  ogImage: 20,        // 20% - Critical for visual appeal
  twitterCard: 10,    // 10% - Important for X/Twitter
  canonical: 10,      // 10% - Important for SEO
  robots: 5,          // 5% - Important but less critical
}

/**
 * Composable for computing meta tag quality score from diagnostics.
 *
 * @returns Object with computeScore function
 */
export function useMetaScore() {
  /**
   * Maps diagnostic status to numeric score. Green=100, Yellow=60, Red=0.
   */
  const getCategoryScore = (status: 'green' | 'yellow' | 'red'): { score: number, result: 'pass' | 'warning' | 'fail' } => {
    switch (status) {
      case 'green':
        return { score: 100, result: 'pass' }
      case 'yellow':
        return { score: 60, result: 'warning' }
      case 'red':
        return { score: 0, result: 'fail' }
    }
  }

  /**
   * Converts numeric score to letter grade. A≥90, B≥80, C≥70, D≥60, F<60.
   */
  const getGrade = (score: number): 'A' | 'B' | 'C' | 'D' | 'F' => {
    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }

  /**
   * Computes weighted overall score from diagnostics.
   *
   * @param diagnostics - From useDiagnostics.generateDiagnostics
   * @returns MetaScore with overall (0–100), grade, and per-category breakdown
   */
  const computeScore = (diagnostics: Diagnostics): MetaScore => {
    // Compute category scores
    const titleResult = getCategoryScore(diagnostics.title.status)
    const descriptionResult = getCategoryScore(diagnostics.description.status)
    const ogResult = getCategoryScore(diagnostics.ogTags.status)
    const ogImageResult = getCategoryScore(diagnostics.ogImage.status)
    const twitterResult = getCategoryScore(diagnostics.twitterCard.status)
    const canonicalResult = getCategoryScore(diagnostics.canonical.status)
    const robotsResult = getCategoryScore(diagnostics.robots.status)

    // Create category objects with issues
    const categories = {
      title: {
        name: 'Title Tag',
        score: titleResult.score,
        maxScore: 100,
        status: titleResult.result,
        weight: WEIGHTS.title,
        issues: titleResult.result !== 'pass' ? [diagnostics.title.message] : [],
      },
      description: {
        name: 'Meta Description',
        score: descriptionResult.score,
        maxScore: 100,
        status: descriptionResult.result,
        weight: WEIGHTS.description,
        issues: descriptionResult.result !== 'pass' ? [diagnostics.description.message] : [],
      },
      openGraph: {
        name: 'Open Graph Tags',
        score: ogResult.score,
        maxScore: 100,
        status: ogResult.result,
        weight: WEIGHTS.openGraph,
        issues: ogResult.result !== 'pass' ? [diagnostics.ogTags.message] : [],
      },
      ogImage: {
        name: 'OG Image',
        score: ogImageResult.score,
        maxScore: 100,
        status: ogImageResult.result,
        weight: WEIGHTS.ogImage,
        issues: ogImageResult.result !== 'pass' ? [diagnostics.ogImage.message] : [],
      },
      twitterCard: {
        name: 'X/Twitter Card',
        score: twitterResult.score,
        maxScore: 100,
        status: twitterResult.result,
        weight: WEIGHTS.twitterCard,
        issues: twitterResult.result !== 'pass' ? [diagnostics.twitterCard.message] : [],
      },
      canonical: {
        name: 'Canonical URL',
        score: canonicalResult.score,
        maxScore: 100,
        status: canonicalResult.result,
        weight: WEIGHTS.canonical,
        issues: canonicalResult.result !== 'pass' ? [diagnostics.canonical.message] : [],
      },
      robots: {
        name: 'Robots Meta',
        score: robotsResult.score,
        maxScore: 100,
        status: robotsResult.result,
        weight: WEIGHTS.robots,
        issues: robotsResult.result !== 'pass' ? [diagnostics.robots.message] : [],
      },
    }

    // Compute weighted overall score
    const overall = Math.round(
      (categories.title.score * WEIGHTS.title +
       categories.description.score * WEIGHTS.description +
       categories.openGraph.score * WEIGHTS.openGraph +
       categories.ogImage.score * WEIGHTS.ogImage +
       categories.twitterCard.score * WEIGHTS.twitterCard +
       categories.canonical.score * WEIGHTS.canonical +
       categories.robots.score * WEIGHTS.robots) / 100
    )

    // Count total issues
    const totalIssues = Object.values(categories)
      .reduce((sum, cat) => sum + cat.issues.length, 0)

    return {
      overall,
      categories,
      totalIssues,
      grade: getGrade(overall),
    }
  }

  return {
    computeScore,
  }
}
