<script setup lang="ts">
import type { Diagnostics, MetaTags } from "~/types/meta";

interface Props {
  diagnostics: Diagnostics;
  tags?: MetaTags;
}

const props = defineProps<Props>();

const getStatusColor = (status: "green" | "yellow" | "red") => {
  const colors = {
    green: "text-emerald-600 dark:text-emerald-400",
    yellow: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
  };
  return colors[status];
};

const getStatusBg = (status: "green" | "yellow" | "red") => {
  const colors = {
    green:
      "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
    yellow:
      "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    red: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
  };
  return colors[status];
};

const getStatusIcon = (status: "green" | "yellow" | "red") => {
  const icons = {
    green: "i-heroicons-check-circle",
    yellow: "i-heroicons-exclamation-triangle",
    red: "i-heroicons-x-circle",
  };
  return icons[status];
};

// Character limits
const LIMITS = {
  title: 60,
  description: 160,
};

// Truncate long text for display
const truncate = (text: string | undefined, maxLength: number = 100) => {
  if (!text) return null;
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
};

// Split text into within-limit and overage portions
const splitAtLimit = (text: string | undefined, limit: number) => {
  if (!text) return { within: "", overage: "" };
  if (text.length <= limit) return { within: text, overage: "" };
  return {
    within: text.substring(0, limit),
    overage: text.substring(limit),
  };
};

// Core diagnostic items (with pass/fail status)
const diagnosticItems = computed(() => [
  {
    label: "Title",
    key: "title",
    result: props.diagnostics.title,
    value: props.tags?.title,
    charCount: props.tags?.title?.length,
    limit: LIMITS.title,
    hasLimit: true,
  },
  {
    label: "Description",
    key: "description",
    result: props.diagnostics.description,
    value: props.tags?.description,
    charCount: props.tags?.description?.length,
    limit: LIMITS.description,
    hasLimit: true,
  },
  {
    label: "Open Graph",
    key: "ogTags",
    result: props.diagnostics.ogTags,
    details: [
      { label: "og:title", value: props.tags?.og?.title },
      { label: "og:description", value: props.tags?.og?.description },
      { label: "og:type", value: props.tags?.og?.type },
      { label: "og:url", value: props.tags?.og?.url },
      { label: "og:site_name", value: props.tags?.og?.siteName },
      { label: "og:locale", value: props.tags?.og?.locale },
      { label: "og:image:alt", value: props.tags?.og?.imageAlt },
      { label: "og:image:width", value: props.tags?.og?.imageWidth },
      { label: "og:image:height", value: props.tags?.og?.imageHeight },
      { label: "og:image:type", value: props.tags?.og?.imageType },
      { label: "og:updated_time", value: props.tags?.og?.updatedTime },
      { label: "og:video", value: props.tags?.og?.video },
      { label: "og:audio", value: props.tags?.og?.audio },
    ].filter((d) => d.value),
  },
  {
    label: "OG Image",
    key: "ogImage",
    result: props.diagnostics.ogImage,
    value: props.tags?.og?.image,
  },
  {
    label: "X/Twitter Card",
    key: "twitterCard",
    result: props.diagnostics.twitterCard,
    details: [
      { label: "twitter:card", value: props.tags?.twitter?.card },
      { label: "twitter:site", value: props.tags?.twitter?.site },
      { label: "twitter:creator", value: props.tags?.twitter?.creator },
      { label: "twitter:title", value: props.tags?.twitter?.title },
      { label: "twitter:description", value: props.tags?.twitter?.description },
      { label: "twitter:image", value: props.tags?.twitter?.image },
      { label: "twitter:image:alt", value: props.tags?.twitter?.imageAlt },
      ...(props.tags?.twitter?.label1
        ? [
            { label: "twitter:label1", value: props.tags?.twitter?.label1 },
            { label: "twitter:data1", value: props.tags?.twitter?.data1 },
          ]
        : []),
      ...(props.tags?.twitter?.label2
        ? [
            { label: "twitter:label2", value: props.tags?.twitter?.label2 },
            { label: "twitter:data2", value: props.tags?.twitter?.data2 },
          ]
        : []),
    ].filter((d) => d.value),
  },
  {
    label: "Canonical URL",
    key: "canonical",
    result: props.diagnostics.canonical,
    value: props.tags?.canonical,
  },
  {
    label: "Robots",
    key: "robots",
    result: props.diagnostics.robots,
    value: props.tags?.robots,
  },
]);

// Additional info sections (informational, no pass/fail)
const hasFacebookTags = computed(
  () => props.tags?.facebook?.appId || props.tags?.facebook?.admins,
);

const hasArticleTags = computed(
  () =>
    props.tags?.article?.author ||
    props.tags?.article?.publishedTime ||
    props.tags?.article?.modifiedTime ||
    props.tags?.article?.section ||
    (props.tags?.article?.tags && props.tags.article.tags.length > 0),
);

const hasSeoTags = computed(
  () =>
    props.tags?.author ||
    props.tags?.keywords ||
    props.tags?.language ||
    props.tags?.generator ||
    props.tags?.viewport ||
    props.tags?.themeColor ||
    props.tags?.favicon,
);

const hasPinterestTags = computed(() => props.tags?.pinterest?.description);

const hasAppleTags = computed(
  () =>
    props.tags?.apple?.mobileWebAppCapable ||
    props.tags?.apple?.mobileWebAppTitle ||
    props.tags?.apple?.mobileWebAppStatusBarStyle ||
    props.tags?.apple?.touchIcon,
);

const hasMicrosoftTags = computed(
  () => props.tags?.microsoft?.tileImage || props.tags?.microsoft?.tileColor,
);

const hasStructuredData = computed(
  () => props.tags?.structuredData && props.tags.structuredData.length > 0,
);

// Format structured data for display
const formatJsonLd = (data: Record<string, unknown>) => {
  return JSON.stringify(data, null, 2);
};

// Basic schema.org validation: @context, @type, and minimum structure
const validateStructuredData = (schema: Record<string, unknown>) => {
  const issues: string[] = [];
  if (!schema["@context"]) issues.push("Missing @context");
  if (!schema["@type"]) issues.push("Missing @type");
  if (typeof schema["@type"] !== "string" && !Array.isArray(schema["@type"])) {
    issues.push("@type should be a string or array");
  }
  return {
    valid: issues.length === 0,
    issues,
  };
};
</script>

<template>
  <div class="space-y-4">
    <!-- Overall Status -->
    <div
      :class="[
        'p-4 rounded-lg border',
        getStatusBg(diagnostics.overall.status),
      ]"
    >
      <div class="flex items-start gap-3">
        <UIcon
          :name="getStatusIcon(diagnostics.overall.status)"
          :class="[
            'w-5 h-5 shrink-0 mt-0.5',
            getStatusColor(diagnostics.overall.status),
          ]"
        />
        <div>
          <p
            :class="[
              'font-semibold',
              getStatusColor(diagnostics.overall.status),
            ]"
          >
            {{ diagnostics.overall.message }}
          </p>
          <p
            v-if="diagnostics.overall.suggestion"
            class="text-sm text-gray-600 dark:text-gray-400 mt-0.5"
          >
            {{ diagnostics.overall.suggestion }}
          </p>
        </div>
      </div>
    </div>

    <!-- Individual Checks -->
    <div
      class="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-200 dark:divide-gray-800"
    >
      <div
        v-for="item in diagnosticItems"
        :key="item.key"
        class="px-4 py-4 bg-white dark:bg-gray-900"
      >
        <!-- Header row -->
        <div class="flex items-start gap-3">
          <UIcon
            :name="getStatusIcon(item.result.status)"
            :class="[
              'w-5 h-5 shrink-0 mt-0.5',
              getStatusColor(item.result.status),
            ]"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-medium text-gray-900 dark:text-gray-100">
                {{ item.label }}
              </span>
              <div class="flex items-center gap-2">
                <span
                  v-if="item.charCount && item.hasLimit"
                  :class="[
                    'text-xs',
                    item.charCount > item.limit
                      ? 'text-red-500 font-medium'
                      : 'text-gray-400',
                  ]"
                >
                  {{ item.charCount }}/{{ item.limit }} chars
                </span>
                <span v-else-if="item.charCount" class="text-xs text-gray-400">
                  {{ item.charCount }} chars
                </span>
                <UBadge
                  :color="
                    item.result.status === 'green'
                      ? 'success'
                      : item.result.status === 'yellow'
                        ? 'warning'
                        : 'error'
                  "
                  size="xs"
                  variant="subtle"
                >
                  {{
                    item.result.status === "green"
                      ? "Pass"
                      : item.result.status === "yellow"
                        ? "Warning"
                        : "Error"
                  }}
                </UBadge>
              </div>
            </div>

            <!-- Status message -->
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ item.result.message }}
            </p>

            <!-- Actual value with overage highlighting for title/description -->
            <div
              v-if="item.value && item.hasLimit"
              class="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <p class="text-sm font-mono break-all">
                <span class="text-gray-700 dark:text-gray-300">{{
                  splitAtLimit(item.value, item.limit).within
                }}</span
                ><span
                  v-if="splitAtLimit(item.value, item.limit).overage"
                  class="bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-300 px-0.5 rounded"
                  :title="`${splitAtLimit(item.value, item.limit).overage.length} characters over the ${item.limit} character limit`"
                  >{{ splitAtLimit(item.value, item.limit).overage }}</span
                >
              </p>
              <p
                v-if="splitAtLimit(item.value, item.limit).overage"
                class="text-[11px] text-red-600 dark:text-red-400 mt-4"
              >
                ✂️ Cut
                {{
                  splitAtLimit(item.value, item.limit).overage.length
                }}
                characters (highlighted in red) to meet the
                {{ item.limit }} character limit
              </p>
            </div>

            <!-- Actual value (single value, no limit) -->
            <div
              v-else-if="item.value"
              class="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <p
                class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all"
              >
                {{ truncate(item.value, 200) }}
              </p>
            </div>

            <!-- Details (multiple values) -->
            <div
              v-if="item.details && item.details.length > 0"
              class="mt-2 space-y-1"
            >
              <div
                v-for="detail in item.details"
                :key="detail.label"
                class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <span
                  class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >
                  {{ detail.label }}
                </span>
                <span
                  class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all"
                >
                  {{ truncate(detail.value, 150) }}
                </span>
              </div>
            </div>

            <!-- Suggestion -->
            <p
              v-if="item.result.suggestion"
              class="text-xs text-gray-500 dark:text-gray-400 mt-2 italic"
            >
              💡 {{ item.result.suggestion }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Additional Meta Information -->
    <div
      v-if="
        hasFacebookTags ||
        hasArticleTags ||
        hasSeoTags ||
        hasPinterestTags ||
        hasAppleTags ||
        hasMicrosoftTags ||
        hasStructuredData
      "
      class="mt-6"
    >
      <h3
        class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"
      >
        <UIcon
          name="i-heroicons-information-circle"
          class="w-5 h-5 text-blue-500"
        />
        Additional Meta Information
      </h3>

      <div
        class="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden divide-y divide-gray-200 dark:divide-gray-800"
      >
        <!-- Facebook Tags -->
        <div v-if="hasFacebookTags" class="px-4 py-4 bg-white dark:bg-gray-900">
          <div class="flex items-center gap-2 mb-3">
            <UIcon
              name="i-simple-icons-facebook"
              class="w-5 h-5 text-blue-600"
            />
            <span class="font-medium text-gray-900 dark:text-gray-100"
              >Facebook</span
            >
          </div>
          <div class="space-y-1">
            <div
              v-if="tags?.facebook?.appId"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >fb:app_id</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.facebook.appId }}</span
              >
            </div>
            <div
              v-if="tags?.facebook?.admins"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >fb:admins</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.facebook.admins }}</span
              >
            </div>
          </div>
        </div>

        <!-- Article Tags -->
        <div v-if="hasArticleTags" class="px-4 py-4 bg-white dark:bg-gray-900">
          <div class="flex items-center gap-2 mb-3">
            <UIcon
              name="i-heroicons-document-text"
              class="w-5 h-5 text-gray-600"
            />
            <span class="font-medium text-gray-900 dark:text-gray-100"
              >Article Metadata</span
            >
          </div>
          <div class="space-y-1">
            <div
              v-if="tags?.article?.author"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >article:author</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all"
                >{{ tags.article.author }}</span
              >
            </div>
            <div
              v-if="tags?.article?.publishedTime"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >article:published</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.article.publishedTime }}</span
              >
            </div>
            <div
              v-if="tags?.article?.modifiedTime"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >article:modified</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.article.modifiedTime }}</span
              >
            </div>
            <div
              v-if="tags?.article?.section"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >article:section</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.article.section }}</span
              >
            </div>
            <div
              v-if="tags?.article?.tags && tags.article.tags.length > 0"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >article:tag</span
              >
              <div class="flex flex-wrap gap-1">
                <UBadge
                  v-for="tag in tags.article.tags"
                  :key="tag"
                  size="xs"
                  variant="subtle"
                  color="neutral"
                >
                  {{ tag }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>

        <!-- SEO Tags -->
        <div v-if="hasSeoTags" class="px-4 py-4 bg-white dark:bg-gray-900">
          <div class="flex items-center gap-2 mb-3">
            <UIcon
              name="i-heroicons-magnifying-glass"
              class="w-5 h-5 text-green-600"
            />
            <span class="font-medium text-gray-900 dark:text-gray-100"
              >SEO & Technical</span
            >
          </div>
          <div class="space-y-1">
            <div
              v-if="tags?.author"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >author</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.author }}</span
              >
            </div>
            <div
              v-if="tags?.keywords"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >keywords</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all"
                >{{ truncate(tags.keywords, 200) }}</span
              >
            </div>
            <div
              v-if="tags?.language"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >language</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.language }}</span
              >
            </div>
            <div
              v-if="tags?.generator"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >generator</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.generator }}</span
              >
            </div>
            <div
              v-if="tags?.viewport"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >viewport</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.viewport }}</span
              >
            </div>
            <div
              v-if="tags?.themeColor"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >theme-color</span
              >
              <div class="flex items-center gap-2">
                <div
                  class="w-4 h-4 rounded border border-gray-300"
                  :style="{ backgroundColor: tags.themeColor }"
                />
                <span
                  class="text-sm font-mono text-gray-700 dark:text-gray-300"
                  >{{ tags.themeColor }}</span
                >
              </div>
            </div>
            <div
              v-if="tags?.favicon"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >favicon</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all"
                >{{ truncate(tags.favicon, 100) }}</span
              >
            </div>
          </div>
        </div>

        <!-- Pinterest Tags -->
        <div
          v-if="hasPinterestTags"
          class="px-4 py-4 bg-white dark:bg-gray-900"
        >
          <div class="flex items-center gap-2 mb-3">
            <UIcon
              name="i-simple-icons-pinterest"
              class="w-5 h-5 text-red-600"
            />
            <span class="font-medium text-gray-900 dark:text-gray-100"
              >Pinterest</span
            >
          </div>
          <div class="space-y-1">
            <div
              v-if="tags?.pinterest?.description"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >pinterest:desc</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all"
                >{{ truncate(tags.pinterest.description, 150) }}</span
              >
            </div>
          </div>
        </div>

        <!-- Apple Tags -->
        <div v-if="hasAppleTags" class="px-4 py-4 bg-white dark:bg-gray-900">
          <div class="flex items-center gap-2 mb-3">
            <UIcon
              name="i-simple-icons-apple"
              class="w-5 h-5 text-gray-800 dark:text-gray-200"
            />
            <span class="font-medium text-gray-900 dark:text-gray-100"
              >Apple/iOS</span
            >
          </div>
          <div class="space-y-1">
            <div
              v-if="tags?.apple?.mobileWebAppCapable"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >web-app-capable</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.apple.mobileWebAppCapable }}</span
              >
            </div>
            <div
              v-if="tags?.apple?.mobileWebAppTitle"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >web-app-title</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.apple.mobileWebAppTitle }}</span
              >
            </div>
            <div
              v-if="tags?.apple?.mobileWebAppStatusBarStyle"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >status-bar-style</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300"
                >{{ tags.apple.mobileWebAppStatusBarStyle }}</span
              >
            </div>
            <div
              v-if="tags?.apple?.touchIcon"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >touch-icon</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all"
                >{{ truncate(tags.apple.touchIcon, 100) }}</span
              >
            </div>
          </div>
        </div>

        <!-- Microsoft Tags -->
        <div
          v-if="hasMicrosoftTags"
          class="px-4 py-4 bg-white dark:bg-gray-900"
        >
          <div class="flex items-center gap-2 mb-3">
            <UIcon
              name="i-simple-icons-microsoft"
              class="w-5 h-5 text-blue-500"
            />
            <span class="font-medium text-gray-900 dark:text-gray-100"
              >Microsoft/Windows</span
            >
          </div>
          <div class="space-y-1">
            <div
              v-if="tags?.microsoft?.tileImage"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >tile-image</span
              >
              <span
                class="text-sm font-mono text-gray-700 dark:text-gray-300 break-all"
                >{{ truncate(tags.microsoft.tileImage, 100) }}</span
              >
            </div>
            <div
              v-if="tags?.microsoft?.tileColor"
              class="flex gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <span
                class="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 w-28"
                >tile-color</span
              >
              <div class="flex items-center gap-2">
                <div
                  class="w-4 h-4 rounded border border-gray-300"
                  :style="{ backgroundColor: tags.microsoft.tileColor }"
                />
                <span
                  class="text-sm font-mono text-gray-700 dark:text-gray-300"
                  >{{ tags.microsoft.tileColor }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Structured Data (JSON-LD) - collapsible -->
        <div
          v-if="hasStructuredData"
          class="px-4 py-4 bg-white dark:bg-gray-900"
        >
          <details class="group">
            <summary
              class="cursor-pointer list-none flex items-center justify-between gap-2"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-heroicons-code-bracket"
                  class="w-5 h-5 text-purple-600"
                />
                <span class="font-medium text-gray-900 dark:text-gray-100">
                  Structured Data (JSON-LD)
                </span>
                <UBadge size="xs" variant="subtle" color="primary">
                  {{ tags?.structuredData?.length }}
                  {{ tags?.structuredData?.length === 1 ? "schema" : "schemas" }}
                </UBadge>
              </div>
              <UIcon
                name="i-heroicons-chevron-down"
                class="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180"
              />
            </summary>
            <div class="mt-3 space-y-2">
              <div
                v-for="(schema, index) in tags?.structuredData"
                :key="index"
                class="p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <div class="flex items-center justify-between gap-2 mb-2">
                  <UBadge size="xs" variant="outline" color="neutral">
                    {{ schema["@type"] || "Unknown Type" }}
                  </UBadge>
                  <span
                    v-if="validateStructuredData(schema).valid"
                    class="text-xs text-emerald-600 dark:text-emerald-400"
                  >
                    ✓ Valid
                  </span>
                  <span
                    v-else
                    class="text-xs text-amber-600 dark:text-amber-400"
                    :title="validateStructuredData(schema).issues.join(', ')"
                  >
                    ⚠ {{ validateStructuredData(schema).issues[0] }}
                  </span>
                </div>
                <pre
                  class="text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto max-h-40 whitespace-pre-wrap break-all"
                >{{ formatJsonLd(schema) }}</pre
                >
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>
