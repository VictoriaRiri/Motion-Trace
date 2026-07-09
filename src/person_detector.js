export class PersonDetector {
  constructor({ confidenceThreshold = 0.35 } = {}) {
    this.confidenceThreshold = confidenceThreshold;
    this.initialized = false;
  }

  async init() {
    // Adapter boundary: replace BrowserPersonDetector with YOLO11/ONNX or backend API here.
    this.initialized = true;
  }

  setConfidenceThreshold(value) {
    this.confidenceThreshold = value;
  }

  detect(imageData, previousLuma = null) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const mask = new Uint8Array(width * height);
    const currentLuma = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i += 1) {
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const luma = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      const motion = previousLuma ? Math.abs(luma - previousLuma[i]) : 0;
      const fieldGreen = g > r * 1.12 && g > b * 1.08 && g > 45;
      const personPixel = !fieldGreen && saturation > 16 && luma > 20 && luma < 246;
      currentLuma[i] = luma;
      if ((motion > 15 && !fieldGreen) || (personPixel && motion > 5)) mask[i] = 1;
    }

    const components = connectedComponents(mask, width, height)
      .map((box) => {
        const confidence = Math.min(0.98, 0.22 + box.area / 450);
        return { ...box, className: "person", confidence };
      })
      .filter((box) => box.confidence >= this.confidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 12);

    return { detections: components, luma: currentLuma };
  }
}

function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const components = [];
  const stack = [];

  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || visited[i]) continue;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    stack.push(i);
    visited[i] = 1;

    while (stack.length) {
      const idx = stack.pop();
      const x = idx % width;
      const y = Math.floor(idx / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const next of [idx - 1, idx + 1, idx - width, idx + width]) {
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
        if (Math.abs((next % width) - x) > 1) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const humanish = h >= w * 0.75 || area > 120;
    if (area > 18 && w > 3 && h > 5 && humanish) {
      components.push({
        bbox: {
          x: minX / width,
          y: minY / height,
          width: w / width,
          height: h / height,
        },
        area,
      });
    }
  }
  return components;
}
