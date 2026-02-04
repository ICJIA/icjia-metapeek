// app/composables/useFetchProxy.ts
// Client-side composable for fetching URLs via proxy

import type { MetaTags } from "~/types/meta";
import metapeekConfig from "../../metapeek.config";

export interface ProxyResponse {
  ok: boolean;
  url: string;
  finalUrl: string;
  redirectChain: Array<{ status: number; from: string; to: string }>;
  statusCode: number;
  contentType: string;
  head: string;
  bodySnippet: string;
  fetchedAt: string;
  timing: number;
}

export interface ProxyError {
  statusCode: number;
  message: string;
}

/**
 * Composable for fetching URLs via the proxy endpoint
 */
export function useFetchProxy() {
  const { parseMetaTags } = useMetaParser();

  /**
   * Determine which proxy endpoint to use
   * - If externalUrl is set in config, use that
   * - Otherwise, use the built-in Nitro server route
   */
  const getProxyEndpoint = (): string => {
    return metapeekConfig.proxy.externalUrl || "/api/fetch";
  };

  /**
   * Fetch a URL via the proxy and parse the returned HTML
   *
   * @param url - The URL to fetch
   * @returns Object containing parsed tags, response metadata, and body snippet for SPA detection
   */
  const fetchUrl = async (
    url: string,
  ): Promise<{
    tags: MetaTags;
    response: ProxyResponse;
  }> => {
    const endpoint = getProxyEndpoint();

    try {
      // Make request to proxy endpoint
      const response = await $fetch<ProxyResponse>(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          url,
        },
      });

      // Validate response structure
      if (!response.ok || !response.head) {
        throw new Error("Invalid response from proxy");
      }

      // Parse the HTML from the proxy response
      const tags = parseMetaTags(response.head);

      return {
        tags,
        response,
      };
    } catch (error: unknown) {
      // Handle fetch errors and map to user-friendly error codes
      // Note: $fetch (ofetch) errors have a different structure than axios

      // Check if it's a $fetch error with status and data
      if (error.data && (error.status || error.statusCode)) {
        // Server returned an error response (400, 404, 500, etc.)
        throw {
          statusCode: error.status || error.statusCode,
          message: error.data?.message || error.statusMessage || error.message,
        } as ProxyError;
      } else if (error.name === "FetchError") {
        // Network error or other fetch-specific error
        throw {
          statusCode: error.statusCode || 0,
          message:
            error.message ||
            "Network request failed. Check your internet connection.",
        } as ProxyError;
      } else {
        // Something else went wrong (validation error, etc.)
        throw {
          statusCode: 0,
          message: error.message || "An unexpected error occurred",
        } as ProxyError;
      }
    }
  };

  return {
    fetchUrl,
  };
}
