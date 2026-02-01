// app/utils/constants.ts

// Character limits from design doc (Reference Tables section)
export const LIMITS = {
  TITLE_GOOGLE: 60,
  DESCRIPTION_GOOGLE: 160,
  OG_TITLE: 90,
  OG_DESCRIPTION: 200,
  TWITTER_TITLE: 70,
  TWITTER_DESCRIPTION: 200,
  LINKEDIN_TITLE: 120,
  LINKEDIN_DESCRIPTION: 150,
} as const

// OG Image specs
export const IMAGE_SPECS = {
  FACEBOOK: {
    recommended: { width: 1200, height: 630 },
    min: { width: 200, height: 200 },
    aspectRatio: 1.91,
  },
  TWITTER_LARGE: {
    recommended: { width: 1200, height: 628 },
    min: { width: 300, height: 157 },
    aspectRatio: 2,
  },
  TWITTER_SUMMARY: {
    recommended: { width: 240, height: 240 },
    min: { width: 144, height: 144 },
    aspectRatio: 1,
  },
  LINKEDIN: {
    recommended: { width: 1200, height: 627 },
    min: { width: 200, height: 200 },
    aspectRatio: 1.91,
  },
} as const

// Required tags for basic functionality
export const REQUIRED_TAGS = [
  'title',
  'description',
  'og:title',
  'og:description',
  'og:image',
] as const
