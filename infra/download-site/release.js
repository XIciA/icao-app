const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

fetch('/version.json', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((release) => {
    setText('version', release.displayVersion);
    setText('updated-at', release.updatedAtDisplay);
    setText('file-size', release.fileSizeDisplay);
    setText('sha256', release.sha256);
    const notes = document.getElementById('release-notes');
    if (notes && Array.isArray(release.notes) && release.notes.length > 0) {
      notes.replaceChildren(...release.notes.map((note) => {
        const item = document.createElement('li');
        item.textContent = note;
        return item;
      }));
    }
  })
  .catch(() => {
    setText('version', '暂时无法读取');
    setText('updated-at', '请稍后刷新');
    setText('file-size', '—');
    setText('sha256', '版本信息暂时不可用');
  });
