import { ApiResponse } from '../types';

const BASE_URL = '/api/v1';

/**
 * Render's free tier sleeps after ~15 minutes idle. While the instance is
 * waking, Render (or Cloudflare in front of it) can answer with an HTML
 * gateway page before the Express app is listening. A real cold start can
 * take close to a minute, so a single retry is not enough.
 *
 * Only auth requests opt into this loop. A non-JSON gateway response means the
 * request never reached the app, so retrying a login or signup cannot
 * duplicate work.
 */
export interface ColdStartOptions {
  retryOnColdStart?: boolean;
  onColdStartRetry?: (attempt: number, maxAttempts: number) => void;
}

// Waits between attempts: 5s + 10s + 15s + 20s + 25s = up to 75s.
const COLD_START_RETRY_DELAYS_MS = [5000, 10000, 15000, 20000, 25000];
const COLD_START_DEADLINE_MS = 90000;
const COLD_START_MESSAGE =
  'The NoteMind API is still waking up. Please wait about a minute, then try again.';
const TEMPORARY_ERROR_MESSAGE =
  'The NoteMind API is temporarily unavailable. Please try again in a moment.';

// 5xx codes that a gateway can return while the instance is unreachable.
const GATEWAY_STATUSES = new Set([500, 502, 503, 504, 520, 521, 522, 523, 524]);

function isGatewayStatus(status: number): boolean {
  return GATEWAY_STATUSES.has(status);
}

/**
 * Render's gateway answers with an HTML page (or an empty body) while the
 * instance wakes. A JSON 5xx is a real answer from the API or Worker and must
 * not be retried.
 */
function isGatewayBody(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed) return true;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return true;
  try {
    JSON.parse(trimmed);
    return false;
  } catch {
    return true;
  }
}

function isGatewayResponse(status: number, text: string): boolean {
  return isGatewayStatus(status) && isGatewayBody(text);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  coldStart: ColdStartOptions = {},
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('notemind_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const requestInit: RequestInit = { ...options, headers };

  try {
    const startedAt = Date.now();
    let response = await fetch(`${BASE_URL}${endpoint}`, requestInit);
    let text = await response.text();
    let retries = 0;

    while (
      coldStart.retryOnColdStart &&
      isGatewayResponse(response.status, text) &&
      retries < COLD_START_RETRY_DELAYS_MS.length
    ) {
      const remaining = COLD_START_DEADLINE_MS - (Date.now() - startedAt);
      if (remaining <= 0) break;

      const waitMs = Math.min(COLD_START_RETRY_DELAYS_MS[retries], remaining);
      retries += 1;
      coldStart.onColdStartRetry?.(retries, COLD_START_RETRY_DELAYS_MS.length + 1);
      await delay(waitMs);
      response = await fetch(`${BASE_URL}${endpoint}`, requestInit);
      text = await response.text();
    }

    let data: ApiResponse<T>;

    try {
      data = text
        ? JSON.parse(text)
        : {
            success: false,
            error: {
              message: isGatewayResponse(response.status, text)
                ? COLD_START_MESSAGE
                : response.status >= 500 && isGatewayBody(text)
                  ? TEMPORARY_ERROR_MESSAGE
                  : `Server returned empty response (HTTP ${response.status})`,
            },
          };
    } catch {
      data = {
        success: false,
        error: {
          message: isGatewayResponse(response.status, text)
            ? COLD_START_MESSAGE
            : response.status >= 500 && isGatewayBody(text)
              ? TEMPORARY_ERROR_MESSAGE
              : `Server response error (HTTP ${response.status}): ${text.slice(0, 120) || response.statusText || 'Invalid response'}`,
        },
      };
    }

    if (response.status === 401) {
      localStorage.removeItem('notemind_token');
      localStorage.removeItem('notemind_user');
    }

    if (!response.ok) {
      throw new Error(data.error?.message || `HTTP error ${response.status}`);
    }

    return data;
  } catch (error: any) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

export async function apiUpload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('notemind_token');

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const text = await response.text();
    let data: ApiResponse<T>;

    try {
      data = text ? JSON.parse(text) : { success: false, error: { message: `Server returned empty response (HTTP ${response.status})` } };
    } catch {
      data = {
        success: false,
        error: {
          message: `Server upload error (HTTP ${response.status}): ${text.slice(0, 120) || response.statusText || 'Invalid response'}`
        }
      };
    }

    if (response.status === 401) {
      localStorage.removeItem('notemind_token');
      localStorage.removeItem('notemind_user');
    }

    if (!response.ok) {
      throw new Error(data.error?.message || `HTTP error ${response.status}`);
    }

    return data;
  } catch (error: any) {
    console.error(`Upload API Error [${endpoint}]:`, error);
    throw error;
  }
}

export async function apiFetchBlob(endpoint: string): Promise<Blob> {
  const token = localStorage.getItem('notemind_token');
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, { headers });
  if (response.status === 401) {
    localStorage.removeItem('notemind_token');
    localStorage.removeItem('notemind_user');
  }

  if (!response.ok) {
    const text = await response.text();
    let message = `Unable to load original file (HTTP ${response.status})`;
    try {
      const data = JSON.parse(text) as ApiResponse;
      message = data.error?.message || message;
    } catch {
      if (text) message = text.slice(0, 120);
    }
    throw new Error(message);
  }

  return response.blob();
}
