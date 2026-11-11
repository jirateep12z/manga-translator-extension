export function DownloadJsonFile(file_name: string, content: unknown): void {
  const blob = new Blob([JSON.stringify(content, null, 2)], {
    type: 'application/json'
  });
  const object_url = URL.createObjectURL(blob);

  try {
    const link_element = document.createElement('a');

    link_element.href = object_url;
    link_element.download = file_name;
    link_element.click();
  } finally {
    URL.revokeObjectURL(object_url);
  }
}
