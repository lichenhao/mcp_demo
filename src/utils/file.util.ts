export function sanitizeFilename(value: string): string {
  return (
    value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_.-]+/gu, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60) || 'snapshot'
  );
}

export function timestampSuffix(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function formatDateLabel(date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
