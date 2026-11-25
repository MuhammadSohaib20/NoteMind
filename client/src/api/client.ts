import { ApiResponse } from '../types';

const BASE_URL = '/api/v1';

/**
 * Render's free tier sleeps after ~15 minutes idle. While the instance is
 * waking, Render's proxy can answer with its own HTML 502/503 page before the
 * Express app is listening. Only auth requests opt into this retry: a gateway
 * 502/503 means the request never reached the app, so retrying a login or
 * signup cannot duplicate work.
 */
export interface ColdStartOptions {
  retryOnColdStart?: boolean;
  onColdStartRetry?: () => void;
}

const COLD_START_RETRY_DELAY_MS = 5000;
const COLD_START_MESSAGE =
  'The NoteMind API is still waking up. Please wait a moment, then try again.';

function isColdStartStatus(status: number): boolean {
  return status === 502 || status === 503;
}

/**
 * Render's gateway answers with an HTML page (or an empty body) while the
 * instance wakes. A JSON 502/503 is a real answer from the API or Worker and
 * must not be retried.
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
    let response = await fetch(`${BASE_URL}${endpoint}`, requestInit);
    let text = await response.text();

    if (
      coldStart.retryOnColdStart &&
      isColdStartStatus(response.status) &&
      isGatewayBody(text)
    ) {
      coldStart.onColdStartRetry?.();
      await delay(COLD_START_RETRY_DELAY_MS);
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
              message: isColdStartStatus(response.status)
                ? COLD_START_MESSAGE
                : response.status === 500 || response.status === 504
                  ? 'Unable to connect to NoteMind API server. Please ensure the backend server on port 3000 is running.'
                  : `Server returned empty response (HTTP ${response.status})`,
            },
          };
    } catch {
      data = {
        success: false,
        error: {
          message: isColdStartStatus(response.status)
            ? COLD_START_MESSAGE
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
