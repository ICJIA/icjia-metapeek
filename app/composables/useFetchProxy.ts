/**
 * @fileoverview Client-side composable for fetching URLs via the secure proxy endpoint.
 * Handles request/response flow and maps proxy errors to user-friendly messages.
 *
 * @module composables/useFetchProxy
 */

import type { MetaTags } from "~/types/meta";
import metapeekConfig from "../../metapeek.config";

/**
 * Successful response from the /api/fetch proxy endpoint.
 */
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

/**
 * Error thrown when the proxy request fails (network, validation, or server error).
 */
export interface ProxyError {
  statusCode: number;
  message: string;
}

/**
 * Composable for fetching URLs via the secure proxy endpoint.
 *
 * @returns Object with fetchUrl function
 */
export function useFetchProxy() {
  const { parseMetaTags } = useMetaParser();

  /**
   * Resolves the proxy endpoint URL. Uses externalUrl from config if set,
   * otherwise the built-in Nitro route /api/fetch.
   *
   * @returns The proxy endpoint URL to POST to
   */
  const getProxyEndpoint = (): string => {
    return metapeekConfig.proxy.externalUrl || "/api/fetch";
  };

  /**
   * Fetches a URL via the proxy and parses the returned HTML into meta tags.
   *
   * @param url - The absolute URL to fetch (must be HTTPS in production)
   * @returns Promise resolving to parsed MetaTags and full ProxyResponse
   * @throws ProxyError when the request fails (SSRF blocked, timeout, etc.)
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
      const err = error as {
        data?: { message?: string };
        status?: number;
        statusCode?: number;
        statusMessage?: string;
        name?: string;
        message?: string;
      };

      // Check if it's a $fetch error with status and data
      if (err?.data && (err?.status ?? err?.statusCode)) {
        // Server returned an error response (400, 404, 500, etc.)
        throw {
          statusCode: err.status ?? err.statusCode ?? 0,
          message:
            err.data?.message ?? err.statusMessage ?? err.message ?? "Request failed",
        } as ProxyError;
      } else if (err?.name === "FetchError") {
        // Network error or other fetch-specific error
        throw {
          statusCode: err.statusCode ?? 0,
          message:
            err.message ?? "Network request failed. Check your internet connection.",
        } as ProxyError;
      } else {
        // Something else went wrong (validation error, etc.)
        throw {
          statusCode: 0,
          message: err?.message ?? "An unexpected error occurred",
        } as ProxyError;
      }
    }
  };

  return {
    fetchUrl,
  };
}
