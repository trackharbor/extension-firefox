const QUERY_ORIGIN = 'https://api-partner.spotify.com';
const QUERY_PATH = '/pathfinder/v2/query';

export function isTargetRequest(input) {
  try {
    const url = new URL(input);
    return url.origin === QUERY_ORIGIN && url.pathname === QUERY_PATH;
  } catch {
    return false;
  }
}

export function formatHeaders(headers = []) {
  const values = new Map();
  for (const { name, value } of headers) {
    const key = name.toLowerCase();
    if (key !== 'authorization' && key !== 'client-token') continue;
    if (typeof value !== 'string' || /[\r\n]/.test(value)) return null;
    values.set(key, value.trim());
  }
  const authorization = values.get('authorization');
  const clientToken = values.get('client-token');
  if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim() || !clientToken) {
    return null;
  }
  return `authorization: ${authorization}\nclient-token: ${clientToken}`;
}
