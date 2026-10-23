/** Match the native avatar payload without requiring a native module in a browser. */
export async function prepareProfileAvatar(uri: string): Promise<string> {
  if (!/^(blob:|data:image\/)/i.test(uri)) throw new Error('Avatar must be a selected local image');
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Image could not be read'));
    image.src = uri;
  });
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height) throw new Error('Image dimensions are invalid');
  const scale = Math.min(1, 256 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const result = canvas.toDataURL('image/jpeg', quality);
      if (/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(result) && result.length <= 180_000) return result;
    }
    throw new Error('Image could not be prepared');
  } finally { canvas.width = 0; canvas.height = 0; image.src = ''; }
}
