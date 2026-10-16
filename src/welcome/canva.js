const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const avatarCenterX = 0.3019; 
const avatarCenterY = 0.4513; 
const avatarWidth   = 0.3009; 

const ringEnabled   = false;
const ringColor     = '#ffffff';
const ringThickness = 6;

const BACKGROUND_PATH = path.join(__dirname, '..', '..', 'public', 'imgs', 'welcome.png');

let backgroundImage = null;
let templateCanvas  = null;

async function ensureBackground() {
  if (templateCanvas) return;

  backgroundImage = await loadImage(BACKGROUND_PATH);
  templateCanvas = createCanvas(backgroundImage.width, backgroundImage.height);
  templateCanvas.getContext('2d').drawImage(backgroundImage, 0, 0);
}

const avatarCache = new Map();
const AVATAR_CACHE_MAX = 100;

async function getCachedAvatar(url) {
  if (avatarCache.has(url)) {
    const img = avatarCache.get(url);
    avatarCache.delete(url); // refresh recency
    avatarCache.set(url, img);
    return img;
  }

  const img = await loadImage(url);

  avatarCache.set(url, img);
  if (avatarCache.size > AVATAR_CACHE_MAX) {
    avatarCache.delete(avatarCache.keys().next().value);
  }
  return img;
}

async function generateWelcomeImage(avatarURL) {
  await ensureBackground();
  const avatar = await getCachedAvatar(avatarURL);

  const canvas = createCanvas(templateCanvas.width, templateCanvas.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(templateCanvas, 0, 0);

  const size   = canvas.width * avatarWidth;
  const radius = size / 2;
  const cx     = canvas.width  * avatarCenterX;
  const cy     = canvas.height * avatarCenterY;
  const x      = cx - radius;
  const y      = cy - radius;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(avatar, x, y, size, size);
  ctx.restore();

  if (ringEnabled) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - ringThickness / 2, 0, Math.PI * 2);
    ctx.lineWidth = ringThickness;
    ctx.strokeStyle = ringColor;
    ctx.stroke();
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateWelcomeImage };