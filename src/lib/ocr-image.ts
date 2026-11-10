// 글자 인식 전에 사진을 다듬는다 (브라우저 전용). 사진은 기기 밖으로 나가지 않는다.
//  - 크기: 작은 사진은 키우고(글자가 너무 작으면 인식이 안 됨), 큰 사진은 줄인다(속도)
//  - 흑백 + 대비 늘리기: 어두운 곳·누런 종이에서 찍은 사진도 글자와 바탕이 뚜렷하게

const MIN_LONG_SIDE = 1600;
const MAX_LONG_SIDE = 2600;
const MAX_UPSCALE = 3;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

// 그림자·조명 차이 없애기: 칸(블록)마다 가장 밝은 값 = 그 자리의 종이 밝기로 보고,
// 픽셀 밝기를 종이 밝기로 나눠 종이는 고르게 흰색, 글자는 어둡게 만든다.
// (전체를 한 번에 밝게/어둡게 하면 그림자 진 쪽 글자가 통째로 묻힌다)
function flattenLighting(gray: Uint8ClampedArray, w: number, h: number) {
  const block = Math.max(16, Math.round(Math.max(w, h) / 60));
  const gw = Math.ceil(w / block);
  const gh = Math.ceil(h / block);
  const grid = new Float32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const gy = Math.floor(y / block) * gw;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      const k = gy + Math.floor(x / block);
      if (v > grid[k]) grid[k] = v;
    }
  }
  // 이웃 칸과 평균 내어 부드럽게 (글자가 빽빽한 칸 보정)
  const smooth = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = gy + dy;
          const xx = gx + dx;
          if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) {
            sum += grid[yy * gw + xx];
            n++;
          }
        }
      }
      smooth[gy * gw + gx] = Math.max(sum / n, 1);
    }
  }
  // 칸 중심 사이를 선형으로 이어 픽셀마다 종이 밝기를 구하고 나눈다
  for (let y = 0; y < h; y++) {
    const fy = Math.min(Math.max(y / block - 0.5, 0), gh - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, gh - 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(Math.max(x / block - 0.5, 0), gw - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, gw - 1);
      const tx = fx - x0;
      const bg =
        (smooth[y0 * gw + x0] * (1 - tx) + smooth[y0 * gw + x1] * tx) * (1 - ty) +
        (smooth[y1 * gw + x0] * (1 - tx) + smooth[y1 * gw + x1] * tx) * ty;
      const i = y * w + x;
      gray[i] = Math.min(255, (gray[i] * 255) / bg);
    }
  }
}

export async function preprocessForOcr(src: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  const longSide = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const target =
    longSide < MIN_LONG_SIDE
      ? Math.min(MIN_LONG_SIDE, longSide * MAX_UPSCALE)
      : Math.min(longSide, MAX_LONG_SIDE);
  const scale = target / longSide;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  const w = canvas.width;
  const h = canvas.height;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
  }

  flattenLighting(gray, w, h);

  const histogram = new Uint32Array(256);
  for (let j = 0; j < gray.length; j++) histogram[gray[j]]++;

  // 밝기 하위 2% → 검정, 상위 2% → 흰색으로 펼친다
  const total = gray.length;
  let low = 0;
  let high = 255;
  for (let acc = 0, v = 0; v < 256; v++) {
    acc += histogram[v];
    if (acc >= total * 0.02) {
      low = v;
      break;
    }
  }
  for (let acc = 0, v = 255; v >= 0; v--) {
    acc += histogram[v];
    if (acc >= total * 0.02) {
      high = v;
      break;
    }
  }
  const range = Math.max(high - low, 1);

  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = Math.max(0, Math.min(255, Math.round(((gray[j] - low) * 255) / range)));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
