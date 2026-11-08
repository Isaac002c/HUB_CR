const DEFAULT_CLIENT_RETURN_PATH = '/dashboard?module=multas&tab=clients';

export const clientDetailHref = (clientId) => {
  const returnTo = typeof window === 'undefined'
    ? DEFAULT_CLIENT_RETURN_PATH
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const query = new URLSearchParams({ returnTo });
  return `/multas/clients/${encodeURIComponent(clientId)}?${query.toString()}`;
};

export const safeClientReturnPath = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_CLIENT_RETURN_PATH;
  }

  try {
    const origin = 'https://cr-recursos.invalid';
    const target = new URL(value, origin);
    if (target.origin !== origin) return DEFAULT_CLIENT_RETURN_PATH;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch (_) {
    return DEFAULT_CLIENT_RETURN_PATH;
  }
};
