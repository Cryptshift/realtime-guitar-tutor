// BPM metadata parsing from page text.
export function parseBpmFromText(rawText, options = {}) {
  const { allowBare = false } = options;
  if (!rawText || typeof rawText !== 'string') return null;

  const text = rawText.replace(/&nbsp;/gi, ' ');
  const candidates = [];
  const patterns = [
    /(?:^|[\s>"'=])(bpm|tempo)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)/gi,
    // Plain or escaped JSON: "bpm":120, "bpm":"120", \"bpm\":120
    /\\?"bpm\\?"\s*:\s*\\?"?(\d{2,3}(?:\.\d+)?)/gi,
    /(\d{2,3}(?:\.\d+)?)\s*bpm/gi,
  ];

  patterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[2] || match[1]);
      if (Number.isFinite(value)) {
        candidates.push(value);
      }
    }
  });

  if (!candidates.length && allowBare) {
    for (const match of text.matchAll(/\b(\d{2,3}(?:\.\d+)?)\b/g)) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 40 && value <= 280) {
        candidates.push(value);
      }
    }
  }

  const valid = candidates.filter((value) => value >= 40 && value <= 280);
  if (!valid.length) return null;

  return Math.round(valid[0]);
}

export function extractBpmMetadata(rawText, doc) {
  const sources = [];
  if (doc) {
    const bpmSelectors = [
      { selector: '[data-testid*="bpm"]', allowBare: true },
      { selector: '[data-testid*="BPM"]', allowBare: true },
      { selector: '[class*="bpm"]', allowBare: true },
      { selector: '[class*="BPM"]', allowBare: true },
      { selector: '[data-testid*="tempo"]', allowBare: true },
      { selector: '[class*="tempo"]', allowBare: true },
      { selector: 'meta[name="description"]', allowBare: false },
    ];

    bpmSelectors.forEach(({ selector, allowBare }) => {
      doc.querySelectorAll(selector).forEach((node) => {
        const content = node.getAttribute('content');
        const text = typeof content === 'string' ? content : (node.textContent || '');
        if (text.trim()) {
          sources.push({ label: selector, text, allowBare });
        }
      });
    });
  }

  sources.push({ label: 'raw', text: rawText, allowBare: false });

  for (const source of sources) {
    const bpm = parseBpmFromText(source.text, { allowBare: source.allowBare });
    if (bpm) {
      return {
        bpm,
        source: source.label,
      };
    }
  }

  return null;
}
