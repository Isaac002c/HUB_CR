const getToken = () => {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('token') ||
    localStorage.getItem('auth-token') ||
    document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=');
      return acc || (/^(token|auth-token)$/.test(k) ? v : '');
    }, '')
  );
};

// Em produção (Vercel), o upload vai direto ao backend para evitar o limite
// de body size do proxy de rewrites do Vercel (~4.5 MB).
// NEXT_PUBLIC_BACKEND_URL é definido como env var no Vercel.
// Em desenvolvimento (localhost), usa o proxy Next.js normalmente (/api/upload).
const getUploadUrl = () => {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL;
  return base ? `${base}/api/upload` : '/api/upload';
};

export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const token = getToken();
  const uploadUrl = getUploadUrl();

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    credentials: 'include',
    body: formData,
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text).error || msg; } catch { msg = text || msg; }
    throw new Error(msg);
  }

  return JSON.parse(text).data; // { url, filename, originalName, mimeType, size }
};
