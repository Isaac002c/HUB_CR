// URLs relativas — o Next.js proxy (next.config.js rewrites) encaminha para o backend
const API_URL = '';

const getAuthHeaders = () => {
  if (typeof window !== 'undefined') {
    let token =
      localStorage.getItem('token') ||
      localStorage.getItem('auth-token') ||
      '';

    if (!token && document.cookie) {
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});
      token = cookies['auth-token'] || cookies['token'] || '';
    }

    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  return { 'Content-Type': 'application/json' };
};

export const apiRequest = async (endpoint, options = {}) => {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const errorData = JSON.parse(text);
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      errorMessage = text || errorMessage;
    }
    throw new Error(errorMessage);
  }

  if (!text) return { success: true, data: null };

  return JSON.parse(text);
};

export const downloadApiFile = async (endpoint, fallbackName = 'download', options = {}) => {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    credentials: 'include',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    let errorMessage = `HTTP ${res.status}`;
    try {
      const errorData = JSON.parse(text);
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      errorMessage = text || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  let filename = fallbackName;
  if (match?.[1]) {
    try { filename = decodeURIComponent(match[1].replace(/"$/g, '').trim()); }
    catch { filename = match[1].replace(/"$/g, '').trim(); }
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
};
