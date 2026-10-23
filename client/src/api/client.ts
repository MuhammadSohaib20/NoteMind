import { ApiResponse } from '../types';

const BASE_URL = '/api/v1';

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('notemind_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const text = await response.text();
    let data: ApiResponse<T>;

    try {
      data = text
        ? JSON.parse(text)
        : {
            success: false,
            error: {
              message:
                response.status === 500 || response.status === 502 || response.status === 504
                  ? 'Unable to connect to NoteMind API server. Please ensure the backend server on port 3000 is running.'
                  : `Server returned empty response (HTTP ${response.status})`,
            },
          };
    } catch {
      data = {
        success: false,
        error: {
          message: `Server response error (HTTP ${response.status}): ${text.slice(0, 120) || response.statusText || 'Invalid response'}`,
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
