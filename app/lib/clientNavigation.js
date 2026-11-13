const DEFAULT_CLIENT_RETURN_PATH = '/dashboard?module=multas&tab=clients';

export const withCurrentPageReturnTo = (href, fallback = DEFAULT_CLIENT_RETURN_PATH) => {
  const returnTo = typeof window === 'undefined'
    ? fallback
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}${new URLSearchParams({ returnTo }).toString()}`;
};

export const clientDetailHref = (clientId) =>
  withCurrentPageReturnTo(`/multas/clients/${encodeURIComponent(clientId)}`);

export const rentalProcessHref = ({ client_id, company_id, vehicle_id }) => {
  if (client_id) return clientDetailHref(client_id);
  if (!company_id) return null;
  const companyPath = `/multas/companies/${encodeURIComponent(company_id)}`;
  const destination = vehicle_id
    ? `${companyPath}/vehicles/${encodeURIComponent(vehicle_id)}`
    : companyPath;
  return withCurrentPageReturnTo(destination, '/dashboard?module=multas&tab=dashboard');
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
