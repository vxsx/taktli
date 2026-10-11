export function safeFilename(name: string): string {
  const clean = name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return clean.slice(0, 60) || 'beat';
}

export function downloadBytes(bytes: Uint8Array<ArrayBuffer>, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
