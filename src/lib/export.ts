export function formatDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new window.Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
