// Fetches a page directly or through third-party CORS proxies.
export function guessPieceNameFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const slug = url.pathname.split('/').filter(Boolean).at(-1) || 'Imported Tab';
    const cleaned = decodeURIComponent(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\.[a-z0-9]+$/i, '')
      .trim();
    return cleaned || 'Imported Tab';
  } catch {
    return 'Imported Tab';
  }
}

export async function fetchTabPage(url) {
  const cleanUrl = url.trim();
  let isUltimateGuitar = false;
  try {
    const parsed = new URL(cleanUrl);
    isUltimateGuitar = /(^|\.)ultimate-guitar\.com$/i.test(parsed.hostname);
  } catch {
    isUltimateGuitar = false;
  }

  const directAttempt = { label: 'direct', target: cleanUrl };
  const allOriginsAttempt = {
    label: 'allorigins',
    target: `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`,
  };
  const jinaAttempt = {
    label: 'jina-mirror',
    target: `https://r.jina.ai/${cleanUrl.replace(/^http:\/\//i, 'https://')}`,
  };

  // Third-party CORS proxies: the URL (not any user data) is sent to them. Ultimate Guitar
  // sends no CORS headers, so skip the direct attempt there and prefer the raw HTML
  // (allorigins) because it carries the .js-store JSON with the tab.
  const proxyAttempts = isUltimateGuitar
    ? [allOriginsAttempt, jinaAttempt]
    : [directAttempt, allOriginsAttempt, jinaAttempt];

  let lastError = null;
  for (const attempt of proxyAttempts) {
    try {
      const response = await fetch(attempt.target);
      if (!response.ok) {
        lastError = new Error(`${attempt.label} returned ${response.status}`);
        continue;
      }
      const text = await response.text();
      if (!text || text.trim().length < 40) {
        lastError = new Error(`${attempt.label} returned empty content`);
        continue;
      }
      return { htmlOrText: text, via: attempt.label };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || 'Could not fetch tab page');
}
