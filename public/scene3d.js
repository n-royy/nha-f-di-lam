import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SC = 0.1; // 10 game px = 1 world unit (road half-width 120px = 12 units)
const ROAD_HALF = 12.0;
const CHUNK_LEN = 38.0; // Length of each roadside architectural chunk
const CHUNK_COUNT = 9;  // 9 chunks = 342 units of deep 3D city/campus ahead

const _v3 = new THREE.Vector3();
const _cA = new THREE.Color();
const _cB = new THREE.Color();

const THEMES = [
  // 0: F-Town, TP.HCM (Khu CNC Q9 - Mưa rào & Triều cường)
  {
    id: 0,
    sky: 0x89b7d6,
    rainSky: 0x4b6377,
    fogNear: 0.0044,
    rainFog: 0.0092,
    sunCol: 0xfff3de,
    sunInt: 2.0,
    hemiSky: 0xa4d2f5,
    hemiGnd: 0x45515c,
    hemiInt: 0.95,
    asphalt: '#3e4750',
    asphaltAlt: '#363f47',
    lane: '#e8e2d5',
    curb: '#cfd5dc',
    sidewalk: '#9ba3ab',
    ground: '#526658',
    groundRight: '#526658',
    signs: ['F-TOWN TOWER', 'KHU CNC Q9', 'CƠM TẤM SÀI GÒN', 'CÀ PHÊ SỮA ĐÁ', 'F-TOWN 3', 'BÁNH MÌ SG'],
  },
  // 1: F-Ville, Hòa Lạc (Đại Lộ Thăng Long - Sương mù & Cao tốc)
  {
    id: 1,
    sky: 0xc9d9e4,
    fogSky: 0xd9e4ec,
    fogNear: 0.0058,
    heavyFog: 0.0175,
    sunCol: 0xfff6e8,
    sunInt: 1.85,
    hemiSky: 0xd3e3f0,
    hemiGnd: 0x4e6e4a,
    hemiInt: 1.05,
    asphalt: '#38424b',
    asphaltAlt: '#313a42',
    lane: '#f2f5f7',
    curb: '#b8c4cc',
    sidewalk: '#6e8c5e',
    ground: '#4a7548',
    groundRight: '#4a7548',
    signs: ['F-VILLE CAMPUS', 'F-VILLE SOFTWARE', 'TRẠM BUS FPT', 'KHU CNC HÒA LẠC', 'ĐẠI LỘ THĂNG LONG', 'F-VILLE 2'],
  },
  // 2: FPT Tower, Cầu Giấy (Phạm Văn Bạch - Phố Hà Nội giờ cao điểm)
  {
    id: 2,
    sky: 0xe6cfb2,
    fogNear: 0.0041,
    sunCol: 0xffe4bc,
    sunInt: 2.15,
    hemiSky: 0xf4dec4,
    hemiGnd: 0x5c5347,
    hemiInt: 0.92,
    asphalt: '#44464a',
    asphaltAlt: '#3b3d41',
    lane: '#f1df9a',
    curb: '#cfc4b2',
    sidewalk: '#b5a896',
    ground: '#6d675f',
    groundRight: '#6d675f',
    signs: ['FPT TOWER', 'PHỐ DUY TÂN', 'PHỞ BÒ HÀ NỘI', 'BÚN CHẢ CẦU GIẤY', 'PHẠM VĂN BẠCH', 'TRÀ ĐÁ VỈA HÈ'],
  },
  // 3: FPT Complex, Đà Nẵng (Ven biển Mỹ Khê - Gió biển & Nắng gắt)
  {
    id: 3,
    sky: 0x76c5ee,
    heatSky: 0xf0be78,
    fogNear: 0.0036,
    heatFog: 0.0056,
    sunCol: 0xfff5d4,
    sunInt: 2.25,
    hemiSky: 0x90d9ff,
    hemiGnd: 0xd4be92,
    hemiInt: 1.0,
    asphalt: '#4a535c',
    asphaltAlt: '#414952',
    lane: '#fff6e0',
    curb: '#e8dfc9',
    sidewalk: '#dfd3b8',
    ground: '#6a9668',
    groundRight: '#ebd5a7',
    signs: ['FPT COMPLEX', 'RESORT MỸ KHÊ', 'MÌ QUẢNG ĐN', 'CÀ PHÊ MUỐI', 'NAM KỲ KHỞI NGHĨA', 'NƯỚC DỪA MÁT'],
  },
];

function detectSoftwareGl() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { supported: false, software: true };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {
      supported: true,
      software: /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu),
    };
  } catch {
    return { supported: false, software: true };
  }
}

function makeCanvasTex(w, h, drawFn, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  drawFn(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeatX || opts.repeatY) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeatX || 1, opts.repeatY || 1);
  }
  if (opts.anisotropy) tex.anisotropy = opts.anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function makeRoadTexture(theme, maxAniso) {
  return makeCanvasTex(512, 512, (c, w, h) => {
    c.fillStyle = theme.asphalt;
    c.fillRect(0, 0, w, h);
    // Subtle road grain patches
    c.fillStyle = theme.asphaltAlt;
    for (let i = 0; i < 65; i++) {
      const px = ((i * 83) % w);
      const py = ((i * 137) % h);
      c.fillRect(px, py, 28 + (i % 34), 16 + (i % 24));
    }
    // Outer solid shoulder lines
    c.fillStyle = theme.lane;
    c.fillRect(14, 0, 7, h);
    c.fillRect(w - 21, 0, 7, h);
    // Center dashed divider (double yellow on Hanoi, bright white elsewhere)
    c.fillStyle = theme.id === 2 ? '#f5cf58' : theme.lane;
    for (let y = 16; y < h; y += 128) {
      c.fillRect(w / 2 - 4, y, 8, 72);
    }
    // Subtle inner lane dashes (4 lanes)
    c.fillStyle = 'rgba(255,255,255,0.34)';
    for (let y = 24; y < h; y += 128) {
      c.fillRect(w * 0.25 - 2, y, 4, 58);
      c.fillRect(w * 0.75 - 2, y, 4, 58);
    }
    // Curb strips at very edges
    c.fillStyle = theme.curb;
    c.fillRect(0, 0, 10, h);
    c.fillRect(w - 10, 0, 10, h);
  }, { repeatX: 1, repeatY: 16, anisotropy: maxAniso });
}

function makeGlassFacadeTexture(baseHex, accentHex, winHex, maxAniso) {
  return makeCanvasTex(256, 256, (c, w, h) => {
    c.fillStyle = baseHex;
    c.fillRect(0, 0, w, h);
    const cols = 6, rows = 8;
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        c.fillStyle = (r + col) % 5 === 0 ? '#d8f1ff' : winHex;
        c.fillRect(col * cw + 5, r * rh + 5, cw - 10, rh - 10);
        c.fillStyle = 'rgba(255,255,255,0.22)';
        c.fillRect(col * cw + 6, r * rh + 6, cw - 12, 4);
      }
      if (accentHex && r % 3 === 1) {
        c.fillStyle = accentHex;
        c.fillRect(0, r * rh, w, 4);
      }
    }
  }, { repeatX: 1, repeatY: 1, anisotropy: maxAniso });
}

function makeSignTexture(text, bgHex, fgHex = '#ffffff', accentBar = false, maxAniso = 4) {
  return makeCanvasTex(512, 128, (c, w, h) => {
    c.fillStyle = bgHex;
    c.fillRect(0, 0, w, h);
    if (accentBar) {
      c.fillStyle = '#0a6ebd'; c.fillRect(0, 0, w / 3, 12);
      c.fillStyle = '#f26f21'; c.fillRect(w / 3, 0, w / 3, 12);
      c.fillStyle = '#37b34a'; c.fillRect((w * 2) / 3, 0, w / 3, 12);
    } else {
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = 6;
      c.strokeRect(5, 5, w - 10, h - 10);
    }
    c.fillStyle = fgHex;
    c.font = '800 44px "Be Vietnam Pro", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + (accentBar ? 6 : 0), w - 36);
  }, { anisotropy: maxAniso });
}

const DEFAULT_BRAND_3D = {
  eventName: 'Nhà F Đi Làm',
  eventTag: '#NhaFDiLam',
  slogan: 'Vượt giờ cao điểm · Chấm công đúng 08:15',
  accentColor: '#f26f21',
  billboards: [
    'FPT · KIẾN TẠO HẠNH PHÚC',
    'CHẤM CÔNG ĐÚNG 08:15',
    'ONE FPT · BỨT TỐC DEADLINE',
    'AN TOÀN · ĐÚNG GIỜ · VUI KHỎE',
  ],
};

function makeBillboardTexture(headline, eventName, eventTag, accentHex, idx, maxAniso) {
  const accent = accentHex || '#f26f21';
  const subPalette = ['#0a6ebd', accent, '#37b34a', '#ffb020'];
  const edgeGlow = subPalette[idx % subPalette.length];
  return makeCanvasTex(512, 224, (c, w, h) => {
    // Deep metallic LED cabinet background
    const bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0d151f');
    bg.addColorStop(0.55, '#152232');
    bg.addColorStop(1, '#0c131c');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    // Subtle glowing accent corner bloom
    const glow = c.createRadialGradient(w * 0.85, h * 0.25, 10, w * 0.85, h * 0.25, 220);
    glow.addColorStop(0, edgeGlow + '44');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);

    // Subtle LED dot-matrix texture
    c.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 18; y < h - 14; y += 10) {
      for (let x = 14; x < w - 14; x += 10) c.fillRect(x, y, 3, 3);
    }

    // Top FPT tri-color + accent ribbon
    c.fillStyle = '#0a6ebd'; c.fillRect(0, 0, w / 3, 12);
    c.fillStyle = accent; c.fillRect(w / 3, 0, w / 3, 12);
    c.fillStyle = '#37b34a'; c.fillRect((w * 2) / 3, 0, w / 3, 12);

    // Crisp outer LED bezel border
    c.strokeStyle = edgeGlow;
    c.lineWidth = 5;
    c.strokeRect(5, 14, w - 10, h - 19);

    // Main bold uppercase billboard headline (wrapped up to 2 crisp lines)
    const msg = String(headline || 'FPT · KIẾN TẠO HẠNH PHÚC').toUpperCase();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const maxW = w - 48;
    c.font = 'italic 700 44px "Chakra Petch", "Be Vietnam Pro", sans-serif';
    let lines = [msg];
    if (c.measureText(msg).width > maxW && msg.indexOf(' ') >= 0) {
      const words = msg.split(' ');
      let bestSplit = 1;
      let bestDiff = 1e9;
      for (let s = 1; s < words.length; s++) {
        const l1 = words.slice(0, s).join(' ');
        const l2 = words.slice(s).join(' ');
        const diff = Math.abs(c.measureText(l1).width - c.measureText(l2).width);
        if (diff < bestDiff) { bestDiff = diff; bestSplit = s; }
      }
      lines = [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
    }
    const fs = lines.length > 1 ? 36 : 44;
    c.font = 'italic 700 ' + fs + 'px "Chakra Petch", "Be Vietnam Pro", sans-serif';
    c.fillStyle = 'rgba(0,0,0,0.65)';
    lines.forEach((ln, li) => {
      const ly = lines.length > 1 ? (74 + li * 42) : 96;
      c.fillText(ln, w / 2 + 2, ly + 3, maxW);
    });
    c.fillStyle = '#fff6ea';
    lines.forEach((ln, li) => {
      const ly = lines.length > 1 ? (74 + li * 42) : 96;
      c.fillText(ln, w / 2, ly, maxW);
    });

    // Bottom event strip: Event Name + Hashtag
    c.fillStyle = 'rgba(6, 11, 16, 0.88)';
    c.fillRect(10, h - 52, w - 20, 40);
    c.fillStyle = accent;
    c.fillRect(10, h - 52, 6, 40);

    c.textAlign = 'left';
    c.fillStyle = '#d4dde6';
    c.font = '800 19px "Be Vietnam Pro", system-ui, sans-serif';
    c.fillText(String(eventName || 'NHÀ F ĐI LÀM').toUpperCase(), 26, h - 31, w * 0.56);

    c.textAlign = 'right';
    c.fillStyle = '#ffb020';
    c.font = 'italic 700 21px "Chakra Petch", "Be Vietnam Pro", sans-serif';
    c.fillText(String(eventTag || '#NhaFDiLam'), w - 24, h - 31, w * 0.36);
  }, { anisotropy: maxAniso });
}

function makeWoodPoleTexture(maxAniso) {
  return makeCanvasTex(64, 256, (c, w, h) => {
    const grad = c.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#7a4518');
    grad.addColorStop(0.28, '#b57435');
    grad.addColorStop(0.52, '#d1924e');
    grad.addColorStop(0.78, '#945822');
    grad.addColorStop(1, '#683912');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    // Crisp longitudinal wood grain streaks
    for (let i = 0; i < 24; i++) {
      const gx = (i * 11.3) % w;
      c.fillStyle = i % 2 === 0 ? 'rgba(58,28,8,0.28)' : 'rgba(248,210,156,0.22)';
      c.fillRect(gx, 0, 2.0, h);
    }
    // Natural wooden bamboo/timber node rings
    c.fillStyle = 'rgba(62,30,8,0.34)';
    c.fillRect(0, 68, w, 4);
    c.fillRect(0, 148, w, 4);
    c.fillRect(0, 214, w, 4);
  }, { anisotropy: maxAniso });
}

function makeFlagTexture(maxAniso) {
  return makeCanvasTex(512, 320, (c, w, h) => {
    // Warm crisp cloth base with subtle woven shading
    const bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.55, '#f6f9fc');
    bg.addColorStop(1, '#eaf0f6');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    // Subtle fabric weave texture
    c.fillStyle = 'rgba(18,36,56,0.025)';
    for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 2);

    // Left hoist sleeve (lashing strip next to wooden pole)
    c.fillStyle = '#e7edf2';
    c.fillRect(0, 0, 26, h);
    c.strokeStyle = 'rgba(18,40,62,0.22)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(26, 0);
    c.lineTo(26, h);
    c.stroke();

    // Two brass grommets along hoist edge
    [46, h - 46].forEach((gy) => {
      c.fillStyle = '#c4903c';
      c.beginPath();
      c.arc(13, gy, 7, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#5a3a14';
      c.beginPath();
      c.arc(13, gy, 3.2, 0, Math.PI * 2);
      c.fill();
    });

    // Clean stitched perimeter trim
    c.strokeStyle = 'rgba(14,34,54,0.16)';
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);

    // Iconic horizontal FPT angled tri-color logo badges (readable left-to-right!)
    const drawPill = (cx, cy, pw, ph, col, letter) => {
      c.save();
      c.translate(cx, cy);
      c.transform(1, 0, -0.22, 1, 0, 0);
      // Soft contact shadow behind badge
      c.fillStyle = 'rgba(12,24,38,0.16)';
      c.beginPath();
      c.roundRect(-pw / 2 + 4, -ph / 2 + 6, pw, ph, 16);
      c.fill();
      // Main vivid FPT block
      c.fillStyle = col;
      c.beginPath();
      c.roundRect(-pw / 2, -ph / 2, pw, ph, 16);
      c.fill();
      // Bold white letter
      c.fillStyle = '#ffffff';
      c.font = '900 84px "Chakra Petch", "Be Vietnam Pro", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(letter, 0, 4);
      c.restore();
    };
    const midY = h * 0.44;
    drawPill(134, midY, 114, 114, '#0a6ebd', 'F');
    drawPill(274, midY, 114, 114, '#f26f21', 'P');
    drawPill(414, midY, 114, 114, '#37b34a', 'T');

    // Vibrant FPT tri-color ribbon along bottom hem
    const bandY = h - 42;
    const bandH = 26;
    const bandX = 32;
    const bandW = (w - 44) / 3;
    c.fillStyle = '#0a6ebd'; c.fillRect(bandX, bandY, bandW + 1, bandH);
    c.fillStyle = '#f26f21'; c.fillRect(bandX + bandW, bandY, bandW + 1, bandH);
    c.fillStyle = '#37b34a'; c.fillRect(bandX + bandW * 2, bandY, bandW, bandH);
  }, { anisotropy: maxAniso });
}

function makeContactShadowTexture() {
  return makeCanvasTex(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(6,10,16,0.52)');
    g.addColorStop(0.55, 'rgba(6,10,16,0.22)');
    g.addColorStop(1, 'rgba(6,10,16,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

function makeOceanTexture(maxAniso) {
  return makeCanvasTex(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#46b8d8');
    g.addColorStop(0.35, '#1b93c2');
    g.addColorStop(1, '#0d689e');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Crisp white surf foam streaks
    c.fillStyle = 'rgba(255,255,255,0.48)';
    for (let y = 0; y < h; y += 32) {
      c.fillRect(8 + Math.sin(y * 0.1) * 5, y, 10, 22);
      c.fillRect(42 + Math.cos(y * 0.08) * 6, y + 10, 6, 18);
    }
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 40; i++) {
      c.fillRect(70 + ((i * 53) % (w - 80)), (i * 41) % h, 24, 3);
    }
  }, { repeatX: 1, repeatY: 10, anisotropy: maxAniso });
}

function makeLedCountdownTexture(stateChar, sec) {
  const palette = stateChar === 'r'
    ? { fg: '#ff3b30', glow: 'rgba(255,59,48,0.85)', border: '#ff4d42', bg: '#180809' }
    : stateChar === 'y'
    ? { fg: '#ffc424', glow: 'rgba(255,196,36,0.85)', border: '#ffcb3d', bg: '#191306' }
    : { fg: '#39f062', glow: 'rgba(57,240,98,0.85)', border: '#42f56b', bg: '#07180d' };
  const label = String(Math.max(0, Math.min(99, sec))).padStart(2, '0');
  return makeCanvasTex(160, 128, (c, w, h) => {
    c.fillStyle = '#090d13';
    c.fillRect(0, 0, w, h);
    c.fillStyle = palette.bg;
    c.fillRect(8, 8, w - 16, h - 16);
    // Subtle LED dot-matrix texture
    c.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 12; y < h - 12; y += 8) {
      for (let x = 12; x < w - 12; x += 8) c.fillRect(x, y, 3, 3);
    }
    // Bright neon bezel
    c.strokeStyle = palette.border;
    c.lineWidth = 6;
    c.strokeRect(6, 6, w - 12, h - 12);
    // Bold glowing countdown digits
    c.save();
    c.font = '900 78px "Chakra Petch", "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = palette.glow;
    c.shadowBlur = 18;
    c.fillStyle = palette.fg;
    c.fillText(label, w / 2, h / 2 + 4);
    c.shadowBlur = 4;
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.28;
    c.fillText(label, w / 2, h / 2 + 4);
    c.restore();
  });
}

function makeLicensePlateTexture(text = '51F-888') {
  return makeCanvasTex(128, 48, (c, w, h) => {
    c.fillStyle = '#f8f9fa';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#1b2430';
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#151b24';
    c.font = '900 26px "Chakra Petch", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 2);
  });
}

function makeTruckCargoTexture(maxAniso) {
  return makeCanvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#dfe5ec';
    c.fillRect(0, 0, w, h);
    // Corrugated vertical aluminum ribs
    for (let x = 0; x < w; x += 16) {
      c.fillStyle = '#eef2f6';
      c.fillRect(x, 0, 7, h);
      c.fillStyle = '#b9c4cf';
      c.fillRect(x + 7, 0, 5, h);
    }
    // Horizontal framing rails & FPT logistics accent stripe
    c.fillStyle = '#8b99a8';
    c.fillRect(0, 0, w, 14);
    c.fillRect(0, h - 14, w, 14);
    c.fillStyle = '#0a6ebd';
    c.fillRect(0, h * 0.44, w, 18);
    c.fillStyle = '#f26f21';
    c.fillRect(0, h * 0.44 + 18, w, 12);
  }, { anisotropy: maxAniso });
}

function makeTruckRearTexture(maxAniso) {
  return makeCanvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#d5dce4';
    c.fillRect(0, 0, w, h);
    // Outer metal frame
    c.strokeStyle = '#5c6978';
    c.lineWidth = 10;
    c.strokeRect(5, 5, w - 10, h - 10);
    // Center double-door seam + vertical chrome lock rods
    c.fillStyle = '#475360';
    c.fillRect(w / 2 - 3, 10, 6, h - 56);
    c.fillStyle = '#f4f7fa';
    c.fillRect(w / 2 - 22, 16, 6, h - 68);
    c.fillRect(w / 2 + 16, 16, 6, h - 68);
    // Upper red/white safety reflectors
    c.fillStyle = '#ff3b30';
    c.fillRect(16, 16, 46, 16);
    c.fillRect(w - 62, 16, 46, 16);
    // High-visibility red/white reflective chevron safety bumper at bottom
    c.save();
    c.beginPath();
    c.rect(10, h - 46, w - 20, 36);
    c.clip();
    c.fillStyle = '#ffffff';
    c.fillRect(10, h - 46, w - 20, 36);
    c.fillStyle = '#e52b20';
    for (let x = -40; x < w + 40; x += 36) {
      c.beginPath();
      c.moveTo(x, h - 46);
      c.lineTo(x + 18, h - 46);
      c.lineTo(x + 4, h - 10);
      c.lineTo(x - 14, h - 10);
      c.closePath();
      c.fill();
    }
    c.restore();
  }, { anisotropy: maxAniso });
}

function makeBarrierStripeTexture(maxAniso) {
  return makeCanvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#ff6a13';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    for (let x = -48; x < w + 48; x += 48) {
      c.beginPath();
      c.moveTo(x, 0); c.lineTo(x + 22, 0);
      c.lineTo(x + 4, h); c.lineTo(x - 18, h);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = '#20262e';
    c.lineWidth = 5;
    c.strokeRect(2, 2, w - 4, h - 4);
  }, { anisotropy: maxAniso });
}

function makeWaterPoolTexture(isFlood) {
  return makeCanvasTex(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    // Organic multi-lobe puddle silhouette
    const drawBlob = (scale, fill) => {
      c.save();
      c.translate(cx, cy);
      c.scale(scale, scale);
      c.beginPath();
      const pts = 24;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const r = 96 + Math.sin(a * 3 + 0.5) * 14 + Math.cos(a * 5 - 0.8) * 8 + Math.sin(a * 2) * 10;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      c.restore();
    };
    // Subtle dark wet asphalt halo
    drawBlob(1.04, 'rgba(18, 28, 38, 0.36)');
    // Main reflective water gradient
    const g = c.createRadialGradient(cx - 26, cy - 28, 12, cx, cy, 118);
    if (isFlood) {
      g.addColorStop(0, 'rgba(128, 212, 248, 0.88)');
      g.addColorStop(0.55, 'rgba(42, 138, 192, 0.78)');
      g.addColorStop(1, 'rgba(20, 86, 132, 0.62)');
    } else {
      g.addColorStop(0, 'rgba(162, 228, 255, 0.92)');
      g.addColorStop(0.5, 'rgba(60, 166, 220, 0.82)');
      g.addColorStop(1, 'rgba(32, 112, 164, 0.66)');
    }
    drawBlob(0.95, g);
    // Crisp sky-reflection specular streaks
    c.fillStyle = 'rgba(255,255,255,0.42)';
    c.beginPath();
    c.ellipse(cx - 24, cy - 26, 36, 12, -0.35, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.beginPath();
    c.ellipse(cx + 28, cy + 20, 26, 9, -0.25, 0, Math.PI * 2);
    c.fill();
    // Concentric raindrop ripple rings
    c.strokeStyle = 'rgba(230,248,255,0.58)';
    c.lineWidth = 3;
    [[cx - 32, cy + 16, 18], [cx + 24, cy - 22, 24], [cx + 8, cy + 36, 14]].forEach(([rx, ry, rr]) => {
      c.beginPath();
      c.ellipse(rx, ry, rr, rr * 0.72, 0, 0, Math.PI * 2);
      c.stroke();
    });
  });
}

function makePotholeTexture() {
  return makeCanvasTex(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    // Radiating asphalt cracks
    c.strokeStyle = 'rgba(18,22,28,0.88)';
    c.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * 62, cy + Math.sin(a) * 58);
      c.lineTo(cx + Math.cos(a + 0.12) * 95, cy + Math.sin(a + 0.12) * 90);
      c.lineTo(cx + Math.cos(a - 0.08) * 116, cy + Math.sin(a - 0.08) * 110);
      c.stroke();
    }
    const drawJagged = (rBase, fill) => {
      c.beginPath();
      const pts = 18;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const r = rBase + Math.sin(a * 5 + 1.1) * (rBase * 0.13) + Math.cos(a * 3) * (rBase * 0.09);
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r * 0.88;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.fillStyle = fill;
      c.fill();
    };
    // Chipped concrete lip
    drawJagged(94, '#7d8892');
    // Dark broken asphalt bevel
    drawJagged(82, '#2d343b');
    // Deep dark crater interior
    const g = c.createRadialGradient(cx + 8, cy + 8, 8, cx, cy, 76);
    g.addColorStop(0, '#090c10');
    g.addColorStop(0.7, '#151b22');
    g.addColorStop(1, '#272f37');
    drawJagged(72, g);
    // Bright highlight lip on far edge so depth pops from 3D camera
    c.strokeStyle = 'rgba(220,228,236,0.65)';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(cx, cy + 4, 76, 0.25, Math.PI - 0.25);
    c.stroke();
  });
}

function makeBanhMiTexture() {
  return makeCanvasTex(256, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f0b654');
    g.addColorStop(0.5, '#d88c2c');
    g.addColorStop(1, '#b56a1c');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Golden crispy diagonal score marks
    c.strokeStyle = '#ffdf9a';
    c.lineWidth = 10;
    c.lineCap = 'round';
    for (let x = 36; x < w - 20; x += 56) {
      c.beginPath();
      c.moveTo(x - 12, 22);
      c.lineTo(x + 22, h - 22);
      c.stroke();
    }
  });
}

function makeWarnBadgeTexture() {
  return makeCanvasTex(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    // Bold yellow/red warning triangle
    c.beginPath();
    c.moveTo(w / 2, 10);
    c.lineTo(w - 10, h - 14);
    c.lineTo(10, h - 14);
    c.closePath();
    c.fillStyle = '#ffcf24';
    c.fill();
    c.lineWidth = 11;
    c.lineJoin = 'round';
    c.strokeStyle = '#e62419';
    c.stroke();
    c.fillStyle = '#181818';
    c.font = '900 68px "Chakra Petch", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('!', w / 2, h * 0.63);
  });
}

function makeBoostPadTexture(maxAniso) {
  return makeCanvasTex(128, 256, (c, w, h) => {
    // Rich translucent neon-emerald lane pad
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(36, 230, 96, 0.85)');
    g.addColorStop(0.1, 'rgba(30, 198, 86, 0.36)');
    g.addColorStop(0.9, 'rgba(30, 198, 86, 0.36)');
    g.addColorStop(1, 'rgba(36, 230, 96, 0.85)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Bright crisp glowing chevrons pointing forward (-Z = top of canvas)
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const y = 48 + i * 84;
      c.strokeStyle = 'rgba(130, 255, 165, 0.48)';
      c.lineWidth = 22;
      c.beginPath();
      c.moveTo(20, y + 30); c.lineTo(w / 2, y - 16); c.lineTo(w - 20, y + 30);
      c.stroke();
      c.strokeStyle = '#dcffe6';
      c.lineWidth = 10;
      c.beginPath();
      c.moveTo(20, y + 30); c.lineTo(w / 2, y - 16); c.lineTo(w - 20, y + 30);
      c.stroke();
    }
  }, { repeatX: 1, repeatY: 1, anisotropy: maxAniso });
}

function vividVehicleColor(hex, out) {
  out.set(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  out.getHSL(hsl);
  if (hsl.l < 0.36) {
    out.setHSL(hsl.h, Math.min(1, hsl.s * 1.15 + 0.08), 0.36 + (hsl.l * 0.25));
  } else if (hsl.s > 0.08 && hsl.s < 0.55) {
    out.setHSL(hsl.h, Math.min(1, hsl.s * 1.18), Math.min(0.88, hsl.l * 1.04));
  }
  return out;
}

class Scene3DManager {
  constructor() {
    this.ready = false;
    this.supported = false;
    this.isSoftwareGl = false;
    this.contextLost = false;
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.width = 1;
    this.height = 1;
    this.curMapId = -1;
    this.camX = 0;
    this.camFov = 45;
    this.camRoll = 0;
    this.maxAniso = 4;
    this.shadowTex = null;

    // World groups
    this.mapGroup = null;
    this.chunks = [];
    this.palmRefs = [];
    this.oceanMesh = null;
    this.oceanTex = null;
    this.roadMesh = null;
    this.roadTextures = {};
    this.signCache = {};
    this.ledCache = {};
    this.boostPadTex = null;
    this.brand = { ...DEFAULT_BRAND_3D, billboards: [...DEFAULT_BRAND_3D.billboards] };
    this.billboardMats = [];
    this.billboardMeshes = [];

    // Actors & pools
    this.playerGroup = null;
    this.flagPoleGroup = null;
    this.flagMesh = null;
    this.flagGeo = null;
    this.flagBasePos = null;
    this.shieldMesh = null;
    this.boostFlame = null;

    this.vehPools = {};
    this.itemPools = {};
    this.lightPool = [];
    this.crossCarPool = [];
    this.finishGate = null;
    this.finishSignMat = null;
    this.finishGateMapId = -1;

    // Particles & weather
    this.rainLines = null;
    this.windLines = null;
    this.speedLines = null;
    this.partMesh = null;
    this.partDummy = new THREE.Object3D();
    this.partCol = new THREE.Color();

    // Shared geometries & materials
    this.mats = {};
    this.geos = {};
  }

  init(canvas, onLost) {
    this.canvas = canvas;
    this.onLost = onLost || null;
    const probe = detectSoftwareGl();
    this.supported = probe.supported;
    this.isSoftwareGl = probe.software;
    if (!this.supported) return false;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !this.isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      this.supported = false;
      return false;
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    const isMob = matchMedia('(pointer:coarse)').matches;
    const pr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, isMob ? 1.5 : 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 1);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      if (this.onLost) this.onLost(true);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      if (this.onLost) this.onLost(false);
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(THEMES[0].sky);
    this.scene.fog = new THREE.FogExp2(THEMES[0].sky, THEMES[0].fogNear);

    // Mandatory studio environment reflection for crisp metallic & glass PBR
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 420);
    this.camera.position.set(0, 21.5, 22);
    this.camera.lookAt(0, 0.5, -18);

    // 3-point outdoor lighting rig (warm sun + cool hemisphere fill + rim)
    this.hemiLight = new THREE.HemisphereLight(0xa4d2f5, 0x45515c, 0.95);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff3de, 2.0);
    this.sunLight.position.set(34, 62, 28);
    if (!this.isSoftwareGl) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(1024, 1024);
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 180;
      this.sunLight.shadow.camera.left = -42;
      this.sunLight.shadow.camera.right = 42;
      this.sunLight.shadow.camera.top = 75;
      this.sunLight.shadow.camera.bottom = -28;
      this.sunLight.shadow.bias = -0.0005;
      this.sunLight.shadow.normalBias = 0.03;
    }
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.sunLight.target.position.set(0, 0, -24);

    this.rimLight = new THREE.DirectionalLight(0xbbe0ff, 0.45);
    this.rimLight.position.set(-28, 22, -45);
    this.scene.add(this.rimLight);

    this.shadowTex = makeContactShadowTexture();
    this._initSharedAssets();
    this._buildRoadAndGround();
    this._buildPlayerBike();
    this._buildPools();
    this._buildFinishGate();
    this._buildWeatherEffects();
    this.setMap(0);

    this.ready = true;
    return true;
  }

  _initSharedAssets() {
    this.mats.tire = new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.88, metalness: 0.05 });
    this.mats.rim = new THREE.MeshStandardMaterial({ color: 0xcfd6de, roughness: 0.25, metalness: 0.85 });
    this.mats.chrome = new THREE.MeshStandardMaterial({ color: 0xdce4ec, roughness: 0.18, metalness: 0.92 });
    this.mats.darkSeat = new THREE.MeshStandardMaterial({ color: 0x222930, roughness: 0.78, metalness: 0.08 });
    this.mats.glassDark = new THREE.MeshStandardMaterial({ color: 0x162430, roughness: 0.12, metalness: 0.65 });
    this.mats.headlight = new THREE.MeshBasicMaterial({ color: 0xfff8dc, toneMapped: false });
    this.mats.taillight = new THREE.MeshBasicMaterial({ color: 0xff1e24, toneMapped: false });
    this.mats.blinkOn = new THREE.MeshBasicMaterial({ color: 0xffbe18, toneMapped: false });
    this.mats.blinkOff = new THREE.MeshStandardMaterial({ color: 0x4b3d20, roughness: 0.6 });
    this.mats.fptBlue = new THREE.MeshStandardMaterial({ color: 0x0a6ebd, roughness: 0.26, metalness: 0.22 });
    this.mats.fptOrange = new THREE.MeshStandardMaterial({ color: 0xf26f21, roughness: 0.58, metalness: 0.05 });
    this.mats.fptGreen = new THREE.MeshStandardMaterial({ color: 0x37b34a, roughness: 0.18, metalness: 0.18 });
    this.mats.skin = new THREE.MeshStandardMaterial({ color: 0xefc29d, roughness: 0.72, metalness: 0.02 });
    this.mats.whiteTrim = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.45, metalness: 0.08 });
    this.mats.concrete = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.82, metalness: 0.04 });
    this.mats.darkMetal = new THREE.MeshStandardMaterial({ color: 0x2f3a44, roughness: 0.42, metalness: 0.68 });
    this.mats.shadow = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.75 });

    // Procedural glass facades per campus
    this.mats.glassBlue = new THREE.MeshStandardMaterial({
      map: makeGlassFacadeTexture('#2a4d6e', '#0a6ebd', '#66b5e8', this.maxAniso),
      roughness: 0.18, metalness: 0.55,
    });
    this.mats.glassFpt = new THREE.MeshStandardMaterial({
      map: makeGlassFacadeTexture('#1f3b57', '#f26f21', '#78c6f2', this.maxAniso),
      roughness: 0.16, metalness: 0.62,
    });
    this.mats.glassComplex = new THREE.MeshStandardMaterial({
      map: makeGlassFacadeTexture('#1a5772', '#37b34a', '#86e2f5', this.maxAniso),
      roughness: 0.16, metalness: 0.58,
    });
    this.mats.facadeWhite = new THREE.MeshStandardMaterial({
      map: makeGlassFacadeTexture('#eceff2', '#0a6ebd', '#4a7fa8', this.maxAniso),
      roughness: 0.42, metalness: 0.15,
    });
    this.mats.hanoiYellow = new THREE.MeshStandardMaterial({
      map: makeGlassFacadeTexture('#dfbe78', '#b56e35', '#3e4a54', this.maxAniso),
      roughness: 0.68, metalness: 0.05,
    });
    this.mats.hanoiTerra = new THREE.MeshStandardMaterial({
      map: makeGlassFacadeTexture('#cc805e', '#f5ead6', '#33404c', this.maxAniso),
      roughness: 0.72, metalness: 0.04,
    });
    this.mats.resortCream = new THREE.MeshStandardMaterial({
      map: makeGlassFacadeTexture('#f2e6d0', '#188cb8', '#68bdd9', this.maxAniso),
      roughness: 0.5, metalness: 0.08,
    });
    this.mats.trunk = new THREE.MeshStandardMaterial({ color: 0x6b4c32, roughness: 0.9, metalness: 0.0 });
    this.mats.woodPole = new THREE.MeshStandardMaterial({
      map: makeWoodPoleTexture(this.maxAniso),
      roughness: 0.76, metalness: 0.04,
    });
    this.mats.brass = new THREE.MeshStandardMaterial({ color: 0xd9a23b, roughness: 0.28, metalness: 0.82 });
    this.mats.rope = new THREE.MeshStandardMaterial({ color: 0xe3cba0, roughness: 0.88, metalness: 0.02 });
    this.mats.leafUrban = new THREE.MeshStandardMaterial({ color: 0x3b8c4a, roughness: 0.78, metalness: 0.02 });
    this.mats.leafHanoi = new THREE.MeshStandardMaterial({ color: 0x4b9444, roughness: 0.8, metalness: 0.02 });
    this.mats.leafPine = new THREE.MeshStandardMaterial({ color: 0x2d6e46, roughness: 0.82, metalness: 0.02 });
    this.mats.leafPalm = new THREE.MeshStandardMaterial({ color: 0x4ba63f, roughness: 0.72, metalness: 0.04, side: THREE.DoubleSide });

    this.oceanTex = makeOceanTexture(this.maxAniso);
    this.mats.ocean = new THREE.MeshStandardMaterial({
      map: this.oceanTex, roughness: 0.22, metalness: 0.35,
    });

    // High-contrast reflective vehicle glass & shared procedural props
    this.mats.vehGlass = new THREE.MeshStandardMaterial({
      color: 0x265b8a, emissive: 0x0b1f33, emissiveIntensity: 0.3,
      roughness: 0.08, metalness: 0.75,
    });
    this.mats.plateMat = new THREE.MeshBasicMaterial({ map: makeLicensePlateTexture('51F-888') });
    this.mats.truckCargo = new THREE.MeshStandardMaterial({
      map: makeTruckCargoTexture(this.maxAniso), roughness: 0.42, metalness: 0.28,
    });
    this.mats.truckRear = new THREE.MeshStandardMaterial({
      map: makeTruckRearTexture(this.maxAniso), roughness: 0.45, metalness: 0.22,
    });
    this.mats.barrierStripe = new THREE.MeshStandardMaterial({
      map: makeBarrierStripeTexture(this.maxAniso), roughness: 0.38, metalness: 0.06,
    });
    this.mats.floodPool = new THREE.MeshBasicMaterial({
      map: makeWaterPoolTexture(true), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    this.mats.waterPool = new THREE.MeshBasicMaterial({
      map: makeWaterPoolTexture(false), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    this.mats.pothole = new THREE.MeshBasicMaterial({
      map: makePotholeTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    this.mats.banhMiCrust = new THREE.MeshStandardMaterial({
      map: makeBanhMiTexture(), roughness: 0.56, metalness: 0.02,
    });
    this.mats.warnSprite = new THREE.SpriteMaterial({
      map: makeWarnBadgeTexture(), transparent: true, depthTest: false,
    });
    this.boostPadTex = makeBoostPadTexture(this.maxAniso);
  }

  _getLedCountdownMat(stateChar, sec) {
    const s = Math.max(0, Math.min(99, sec | 0));
    const key = stateChar + '_' + s;
    if (!this.ledCache[key]) {
      this.ledCache[key] = new THREE.MeshBasicMaterial({
        map: makeLedCountdownTexture(stateChar, s),
        toneMapped: false,
      });
    }
    return this.ledCache[key];
  }

  _getSignMat(text, bgHex, accentBar = false) {
    const key = text + '|' + bgHex + '|' + accentBar;
    if (!this.signCache[key]) {
      this.signCache[key] = new THREE.MeshStandardMaterial({
        map: makeSignTexture(text, bgHex, '#ffffff', accentBar, this.maxAniso),
        roughness: 0.35, metalness: 0.1,
      });
    }
    return this.signCache[key];
  }

  _buildRoadAndGround() {
    // Wide outer ground left & right (never floats in a void!)
    this.leftGroundMat = new THREE.MeshStandardMaterial({ color: 0x526658, roughness: 0.92, metalness: 0.0 });
    this.rightGroundMat = new THREE.MeshStandardMaterial({ color: 0x526658, roughness: 0.92, metalness: 0.0 });
    this.sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x9ba3ab, roughness: 0.85, metalness: 0.04 });

    const leftGnd = new THREE.Mesh(new THREE.PlaneGeometry(240, 480), this.leftGroundMat);
    leftGnd.rotation.x = -Math.PI / 2;
    leftGnd.position.set(-ROAD_HALF - 120, -0.06, -150);
    leftGnd.receiveShadow = true;
    this.scene.add(leftGnd);

    const rightGnd = new THREE.Mesh(new THREE.PlaneGeometry(240, 480), this.rightGroundMat);
    rightGnd.rotation.x = -Math.PI / 2;
    rightGnd.position.set(ROAD_HALF + 120, -0.06, -150);
    rightGnd.receiveShadow = true;
    this.scene.add(rightGnd);

    // Raised sidewalks on both flanks of road
    const swGeo = new THREE.BoxGeometry(5.5, 0.26, 480);
    const swL = new THREE.Mesh(swGeo, this.sidewalkMat);
    swL.position.set(-ROAD_HALF - 2.75, 0.07, -150);
    swL.receiveShadow = true;
    this.scene.add(swL);

    const swR = new THREE.Mesh(swGeo, this.sidewalkMat);
    swR.position.set(ROAD_HALF + 2.75, 0.07, -150);
    swR.receiveShadow = true;
    this.scene.add(swR);

    // Main 4-lane asphalt road (scrolling UV)
    this.roadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.06 });
    this.roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 480), this.roadMat);
    this.roadMesh.rotation.x = -Math.PI / 2;
    this.roadMesh.position.set(0, 0, -150);
    this.roadMesh.receiveShadow = true;
    this.scene.add(this.roadMesh);

    // Coastal Ocean plane (visible only on Map 3: FPT Complex Đà Nẵng!)
    this.oceanMesh = new THREE.Mesh(new THREE.PlaneGeometry(180, 480), this.mats.ocean);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.position.set(ROAD_HALF + 109, -0.015, -150);
    this.oceanMesh.visible = false;
    this.scene.add(this.oceanMesh);

    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
  }

  // ---------- Composite 3-12 part Landmark Builders for each of the 4 FPT Campuses ----------

  _makeUrbanTree(style) {
    const g = new THREE.Group();
    if (style === 'palm') {
      // Curved coconut palm with swaying crown
      const trunk1 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 3.2, 7), this.mats.trunk);
      trunk1.position.set(0, 1.6, 0);
      trunk1.rotation.z = -0.14;
      g.add(trunk1);
      const trunk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.0, 7), this.mats.trunk);
      trunk2.position.set(0.45, 4.4, 0);
      trunk2.rotation.z = -0.24;
      g.add(trunk2);
      const crown = new THREE.Group();
      crown.position.set(0.85, 5.7, 0);
      const frondGeo = new THREE.ConeGeometry(0.55, 3.4, 4);
      frondGeo.scale(1, 1, 0.28);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const f = new THREE.Mesh(frondGeo, this.mats.leafPalm);
        f.position.set(Math.cos(ang) * 1.4, -0.2, Math.sin(ang) * 1.4);
        f.rotation.order = 'YXZ';
        f.rotation.y = -ang + Math.PI / 2;
        f.rotation.x = 1.25;
        crown.add(f);
      }
      g.add(crown);
      this.palmRefs.push(crown);
      return g;
    }

    const matLeaf = style === 'pine' ? this.mats.leafPine : style === 'hanoi' ? this.mats.leafHanoi : this.mats.leafUrban;
    const hTrunk = style === 'hanoi' ? 2.8 : 2.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, hTrunk, 6), this.mats.trunk);
    trunk.position.y = hTrunk / 2;
    g.add(trunk);

    if (style === 'pine') {
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3.2, 7), matLeaf);
      c1.position.y = hTrunk + 1.0;
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.6, 7), matLeaf);
      c2.position.y = hTrunk + 2.6;
      g.add(c1, c2);
    } else {
      const r1 = style === 'hanoi' ? 2.1 : 1.7;
      const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(r1, 0), matLeaf);
      c1.position.set(0, hTrunk + r1 * 0.72, 0);
      c1.scale.set(1.15, 0.78, 1.15);
      const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(r1 * 0.72, 0), matLeaf);
      c2.position.set(0.85, hTrunk + r1 * 1.15, 0.45);
      const c3 = new THREE.Mesh(new THREE.DodecahedronGeometry(r1 * 0.65, 0), matLeaf);
      c3.position.set(-0.75, hTrunk + r1 * 0.95, -0.5);
      g.add(c1, c2, c3);
    }
    return g;
  }

  _makeStreetLamp(side) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7.2, 6), this.mats.darkMetal);
    pole.position.y = 3.6;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.14), this.mats.darkMetal);
    arm.position.set(-side * 1.0, 7.1, 0);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.35), this.mats.headlight);
    bulb.position.set(-side * 1.9, 6.95, 0);
    g.add(pole, arm, bulb);
    return g;
  }

  // MAP 0: Iconic F-Town Tech Campus (white-blue-orange-green horizontal louver blocks + Saigon shophouse)
  _buildFTownBlock(side, idx) {
    const g = new THREE.Group();
    const xBase = side * (ROAD_HALF + 14.5);
    if (idx % 2 === 0) {
      // Iconic F-Town Campus Building (7 parts)
      const body = new THREE.Mesh(new THREE.BoxGeometry(17, 15.5, 22), this.mats.facadeWhite);
      body.position.set(xBase, 7.75, 0);
      body.castShadow = !this.isSoftwareGl;
      body.receiveShadow = true;
      g.add(body);

      // Signature FPT tri-color architectural fins along road-facing facade
      const finCols = [this.mats.fptBlue, this.mats.fptOrange, this.mats.fptGreen];
      for (let i = 0; i < 3; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 22.4), finCols[i]);
        fin.position.set(xBase - side * 8.6, 5.2 + i * 3.8, 0);
        g.add(fin);
      }

      // Glass lobby canopy
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 11), this.mats.glassBlue);
      canopy.position.set(xBase - side * 9.8, 3.2, 0);
      g.add(canopy);

      // Rooftop skylight atrium + AC units
      const atrium = new THREE.Mesh(new THREE.BoxGeometry(8, 2.2, 12), this.mats.glassBlue);
      atrium.position.set(xBase + side * 1.5, 16.6, 0);
      g.add(atrium);

      // Crisp F-TOWN rooftop sign facing the road/camera
      const signTxt = THEMES[0].signs[(idx + (side > 0 ? 1 : 0)) % 2];
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.0, 12.5), this._getSignMat(signTxt, '#0a6ebd', true));
      sign.position.set(xBase - side * 8.2, 17.2, 0);
      g.add(sign);
    } else {
      // Modern Saigon Shophouse row with vibrant awning
      const h1 = 9.5 + (idx % 3) * 2.4;
      const body = new THREE.Mesh(new THREE.BoxGeometry(14, h1, 14), idx % 3 === 0 ? this.mats.hanoiYellow : this.mats.facadeWhite);
      body.position.set(xBase - side * 1.0, h1 / 2, -7);
      body.castShadow = !this.isSoftwareGl;
      g.add(body);

      const h2 = 11.5;
      const body2 = new THREE.Mesh(new THREE.BoxGeometry(14, h2, 14), this.mats.glassBlue);
      body2.position.set(xBase - side * 1.0, h2 / 2, 9);
      body2.castShadow = !this.isSoftwareGl;
      g.add(body2);

      // Striped shop awning + readable signboard
      const awning = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 13.5), this.mats.fptOrange);
      awning.position.set(xBase - side * 8.8, 3.4, -7);
      awning.rotation.z = side * 0.28;
      g.add(awning);

      const signTxt = THEMES[0].signs[2 + (idx % 4)];
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.2, 10.5), this._getSignMat(signTxt, '#c94a1a', false));
      sign.position.set(xBase - side * 8.15, 5.2, -7);
      g.add(sign);
    }
    // Sidewalk trees & streetlamp
    const tree = this._makeUrbanTree('urban');
    tree.position.set(side * (ROAD_HALF + 3.2), 0.2, -13);
    g.add(tree);
    const lamp = this._makeStreetLamp(side);
    lamp.position.set(side * (ROAD_HALF + 1.2), 0.2, 11);
    g.add(lamp);
    return g;
  }

  // MAP 1: Iconic F-Ville (Hòa Lạc) — Curved-roof campus pavilions, FPT Bus stop, guardrails & Ba Vì hills
  _buildFVilleBlock(side, idx) {
    const g = new THREE.Group();
    const xBase = side * (ROAD_HALF + 18);

    // Highway metal guardrail along Đại lộ Thăng Long
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, CHUNK_LEN), this.mats.chrome);
    rail.position.set(side * (ROAD_HALF + 1.1), 0.85, 0);
    g.add(rail);
    for (let z = -15; z <= 15; z += 10) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.0, 0.24), this.mats.darkMetal);
      post.position.set(side * (ROAD_HALF + 1.1), 0.5, z);
      g.add(post);
    }

    if (idx % 2 === 0) {
      // Iconic F-Ville Campus Pavilion with curved vault roof & glass gallery
      const base = new THREE.Mesh(new THREE.BoxGeometry(19, 10.5, 24), this.mats.facadeWhite);
      base.position.set(xBase, 5.25, 0);
      base.castShadow = !this.isSoftwareGl;
      g.add(base);

      // Curved steel-slate roof (characteristic F-Ville silhouette)
      const roof = new THREE.Mesh(
        new THREE.CylinderGeometry(10.2, 10.2, 24.8, 12, 1, false, 0, Math.PI),
        this.mats.glassBlue
      );
      roof.rotation.x = Math.PI / 2;
      roof.rotation.z = Math.PI / 2;
      roof.scale.set(0.38, 1, 1);
      roof.position.set(xBase, 10.4, 0);
      g.add(roof);

      // Orange FPT architectural ribbon
      const band = new THREE.Mesh(new THREE.BoxGeometry(19.4, 1.1, 24.4), this.mats.fptOrange);
      band.position.set(xBase, 9.8, 0);
      g.add(band);

      const signTxt = THEMES[1].signs[idx % 2];
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.8, 14), this._getSignMat(signTxt, '#14334d', true));
      sign.position.set(xBase - side * 9.8, 12.2, 0);
      g.add(sign);
    } else {
      // Covered "TRẠM BUS FPT" highway shelter + Pine/Acacia Campus Park + Distant Ba Vì Hills!
      const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.45, 11), this.mats.fptOrange);
      shelterRoof.position.set(side * (ROAD_HALF + 5.2), 3.6, 0);
      g.add(shelterRoof);
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 10.5), this.mats.glassBlue);
      backWall.position.set(side * (ROAD_HALF + 7.2), 1.8, 0);
      g.add(backWall);
      const busSign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 8.5), this._getSignMat('TRẠM BUS FPT', '#0a6ebd', true));
      busSign.position.set(side * (ROAD_HALF + 3.1), 4.4, 0);
      g.add(busSign);

      // Distant Ba Vì hill mass in background
      const hillMat = new THREE.MeshStandardMaterial({ color: 0x456b52, roughness: 0.95 });
      const hill = new THREE.Mesh(new THREE.ConeGeometry(28, 22, 7), hillMat);
      hill.position.set(side * (ROAD_HALF + 44), 10, 0);
      hill.scale.set(1.1, 0.9, 1.4);
      g.add(hill);
    }

    // Lush Hòa Lạc pine & campus trees
    for (let ti = -1; ti <= 1; ti += 2) {
      const tree = this._makeUrbanTree('pine');
      tree.position.set(side * (ROAD_HALF + 5.2), 0.1, ti * 13.5);
      tree.scale.setScalar(0.95 + ((idx + ti + 2) % 3) * 0.12);
      g.add(tree);
    }
    return g;
  }

  // MAP 2: Iconic FPT Tower (Cầu Giấy, Hà Nội) — Twin Glass Skyscrapers + Hanoi Townhouses + Canopy Trees
  _buildFptTowerBlock(side, idx) {
    const g = new THREE.Group();
    const xBase = side * (ROAD_HALF + 14.5);

    if (idx % 2 === 0) {
      // Iconic FPT Tower Twin Glass Skyscraper (stepped crown + FPT Orange/Green bands!)
      const hMain = 26 + (idx % 3) * 4;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(16, hMain, 18), this.mats.glassFpt);
      tower.position.set(xBase, hMain / 2, -4);
      tower.castShadow = !this.isSoftwareGl;
      g.add(tower);

      // Secondary stepped glass wing
      const wingH = hMain * 0.72;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(13, wingH, 12), this.mats.glassBlue);
      wing.position.set(xBase + side * 1.2, wingH / 2, 11);
      wing.castShadow = !this.isSoftwareGl;
      g.add(wing);

      // Iconic FPT Orange & Green accent bands wrapping the facade
      const orangeBand = new THREE.Mesh(new THREE.BoxGeometry(16.6, 1.2, 18.6), this.mats.fptOrange);
      orangeBand.position.set(xBase, hMain - 3.2, -4);
      const greenBand = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.9, 18.6), this.mats.fptGreen);
      greenBand.position.set(xBase, hMain - 5.0, -4);
      g.add(orangeBand, greenBand);

      // Glowing FPT TOWER crown sign
      const signTxt = idx % 4 === 0 ? 'FPT TOWER' : 'PHỐ DUY TÂN';
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.0, 12.5), this._getSignMat(signTxt, '#102840', true));
      sign.position.set(xBase - side * 8.2, 11.5, -4);
      g.add(sign);
    } else {
      // Classic Hanoi Townhouses (Nhà Ống Hà Nội: ochre yellow, terracotta, tiled roofs, street eateries)
      const colors = [this.mats.hanoiYellow, this.mats.hanoiTerra, this.mats.facadeWhite];
      for (let hi = 0; hi < 3; hi++) {
        const hh = 10.5 + ((idx + hi) % 3) * 3.0;
        const hz = -12 + hi * 12;
        const house = new THREE.Mesh(new THREE.BoxGeometry(13, hh, 11.2), colors[(idx + hi) % 3]);
        house.position.set(xBase - side * 1.2, hh / 2, hz);
        house.castShadow = !this.isSoftwareGl;
        g.add(house);

        // Sloped tiled rooftop accent
        const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 2.4, 4), this.mats.fptOrange);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(xBase - side * 1.2, hh + 1.2, hz);
        g.add(roof);
      }

      // Iconic Hanoi eatery awning & sign
      const signTxt = THEMES[2].signs[2 + (idx % 4)];
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.2, 11), this._getSignMat(signTxt, '#9e321e', false));
      sign.position.set(xBase - side * 7.85, 4.8, 0);
      g.add(sign);
    }

    // Spreading Hanoi street trees + streetlamp
    for (let ti = 0; ti < 2; ti++) {
      const tree = this._makeUrbanTree('hanoi');
      tree.position.set(side * (ROAD_HALF + 3.0), 0.2, -10 + ti * 20);
      g.add(tree);
    }
    const lamp = this._makeStreetLamp(side);
    lamp.position.set(side * (ROAD_HALF + 1.1), 0.2, 0);
    g.add(lamp);
    return g;
  }

  // MAP 3: Iconic FPT Complex (Đà Nẵng) — Giant Circular Ring Building (Left) + Mỹ Khê Beach & Swaying Palms (Right)
  _buildFptComplexBlock(side, idx) {
    const g = new THREE.Group();
    if (side < 0) {
      // LEFT SIDE: Iconic FPT Complex Giant Ring Building & Coastal Resorts!
      const xBase = -(ROAD_HALF + 17.5);
      if (idx % 2 === 0) {
        // Monumental FPT Complex Circular Ring Campus (unmistakable Danang landmark!)
        const ringOuter = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.8, 9.5, 20, 1, true), this.mats.glassComplex);
        ringOuter.position.set(xBase - 3, 4.75, 0);
        ringOuter.castShadow = !this.isSoftwareGl;
        g.add(ringOuter);

        // White circular roof ring crown (Torus flattened into architectural ring)
        const ringRoof = new THREE.Mesh(new THREE.TorusGeometry(12.2, 2.6, 8, 24), this.mats.whiteTrim);
        ringRoof.rotation.x = Math.PI / 2;
        ringRoof.scale.set(1, 1, 0.42);
        ringRoof.position.set(xBase - 3, 9.6, 0);
        g.add(ringRoof);

        // FPT Tri-color accent ring
        const orangeRing = new THREE.Mesh(new THREE.TorusGeometry(14.7, 0.45, 6, 24), this.mats.fptOrange);
        orangeRing.rotation.x = Math.PI / 2;
        orangeRing.position.set(xBase - 3, 8.2, 0);
        g.add(orangeRing);

        // Central green courtyard trees inside the ring
        const court = new THREE.Mesh(new THREE.CircleGeometry(10.5, 16), this.mats.leafUrban);
        court.rotation.x = -Math.PI / 2;
        court.position.set(xBase - 3, 0.25, 0);
        g.add(court);

        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.8, 13.5), this._getSignMat('FPT COMPLEX', '#0e7496', true));
        sign.position.set(-(ROAD_HALF + 5.6), 11.4, 0);
        g.add(sign);
      } else {
        // Sleek Danang Coastal Resort & Salt Coffee pavilion
        const resort = new THREE.Mesh(new THREE.BoxGeometry(15, 13.5, 22), this.mats.resortCream);
        resort.position.set(xBase + 1.5, 6.75, 0);
        resort.castShadow = !this.isSoftwareGl;
        g.add(resort);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.8, 23.2), this.mats.fptBlue);
        roof.position.set(xBase + 1.5, 13.8, 0);
        g.add(roof);
        const signTxt = THEMES[3].signs[1 + (idx % 4)];
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 11.5), this._getSignMat(signTxt, '#0f6a8a', false));
        sign.position.set(xBase + 9.2, 6.2, 0);
        g.add(sign);
      }
      const palmL = this._makeUrbanTree('palm');
      palmL.position.set(-(ROAD_HALF + 3.2), 0.2, -13);
      palmL.rotation.y = Math.PI;
      g.add(palmL);
    } else {
      // RIGHT SIDE: Biển Mỹ Khê Beach Promenade — Swaying Coconut Palms + Beach Umbrellas!
      for (let pi = 0; pi < 2; pi++) {
        const palm = this._makeUrbanTree('palm');
        palm.position.set(ROAD_HALF + 4.4, 0.15, -10 + pi * 19);
        palm.rotation.y = (idx * 0.7 + pi) % 1.4;
        g.add(palm);
      }
      // Colorful striped beach umbrellas on golden Mỹ Khê sand
      const umbColors = [this.mats.fptOrange, this.mats.fptBlue, this.mats.fptGreen];
      for (let ui = 0; ui < 2; ui++) {
        const ug = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 5), this.mats.whiteTrim);
        pole.position.y = 1.5;
        const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.9, 8), umbColors[(idx + ui) % 3]);
        top.position.y = 3.0;
        ug.add(pole, top);
        ug.position.set(ROAD_HALF + 14.5 + ui * 4.5, 0.0, -8 + ui * 18);
        g.add(ug);
      }
      if (idx % 3 === 0) {
        const bSign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 8.5), this._getSignMat('BIỂN MỸ KHÊ', '#0b7fa8', false));
        bSign.position.set(ROAD_HALF + 6.5, 3.2, 0);
        g.add(bSign);
      }
    }
    return g;
  }

  setMap(mapId) {
    if (this.curMapId === mapId) return;
    this.curMapId = mapId;
    const theme = THEMES[mapId] || THEMES[0];

    // Update sky, fog & lighting temperature
    this.scene.background.setHex(theme.sky);
    this.scene.fog.color.setHex(theme.sky);
    this.scene.fog.density = theme.fogNear;
    this.sunLight.color.setHex(theme.sunCol);
    this.sunLight.intensity = theme.sunInt;
    this.hemiLight.color.setHex(theme.hemiSky);
    this.hemiLight.groundColor.setHex(theme.hemiGnd);
    this.hemiLight.intensity = theme.hemiInt;

    // Road & ground palette
    if (!this.roadTextures[mapId]) {
      this.roadTextures[mapId] = makeRoadTexture(theme, this.maxAniso);
    }
    this.roadMat.map = this.roadTextures[mapId];
    this.roadMat.needsUpdate = true;
    this.leftGroundMat.color.set(theme.ground);
    this.rightGroundMat.color.set(theme.groundRight);
    this.sidewalkMat.color.set(theme.sidewalk);
    this.oceanMesh.visible = (mapId === 3);

    // Clear old roadside chunks cleanly
    while (this.mapGroup.children.length > 0) {
      this.mapGroup.remove(this.mapGroup.children[0]);
    }
    this.chunks = [];
    this.palmRefs = [];
    this.billboardMeshes = [];
    if (this.billboardMats.length < 4) this._rebuildBillboardMats();

    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = new THREE.Group();
      const buildFn = mapId === 0 ? this._buildFTownBlock.bind(this)
        : mapId === 1 ? this._buildFVilleBlock.bind(this)
        : mapId === 2 ? this._buildFptTowerBlock.bind(this)
        : this._buildFptComplexBlock.bind(this);
      chunk.add(buildFn(-1, i));
      chunk.add(buildFn(1, i));
      // Elevated angled 3D LED Street Billboards every 2 chunks (on left side only for Map 3 beach)
      if (i % 2 === 0) {
        const bbSide = mapId === 3 ? -1 : (i % 4 === 0 ? -1 : 1);
        chunk.add(this._makeRoadsideBillboard(bbSide, (i / 2) | 0));
      }
      chunk.position.z = 38 - i * CHUNK_LEN;
      this.mapGroup.add(chunk);
      this.chunks.push(chunk);
    }
  }

  _rebuildBillboardMats() {
    for (let i = 0; i < this.billboardMats.length; i++) {
      const old = this.billboardMats[i];
      if (old && old.map) old.map.dispose();
      if (old) old.dispose();
    }
    const b = this.brand || DEFAULT_BRAND_3D;
    const list = Array.isArray(b.billboards) && b.billboards.length ? b.billboards : DEFAULT_BRAND_3D.billboards;
    this.billboardMats = [0, 1, 2, 3].map((idx) => {
      const txt = list[idx % list.length] || DEFAULT_BRAND_3D.billboards[idx];
      const tex = makeBillboardTexture(txt, b.eventName, b.eventTag, b.accentColor, idx, this.maxAniso);
      return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    });
  }

  _makeRoadsideBillboard(side, slotIdx) {
    const g = new THREE.Group();
    const xPos = side * (ROAD_HALF + 4.4);
    g.position.set(xPos, 0, 14);
    // Angle inward toward approaching player camera for high readability while driving!
    g.rotation.y = side < 0 ? 0.42 : -0.42;

    // Twin heavy dark-steel support columns + concrete bases
    [-3.4, 3.4].forEach((px) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.7, 0.95), this.mats.concrete);
      base.position.set(px, 0.35, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 6.4, 8), this.mats.darkMetal);
      pole.position.set(px, 3.7, 0);
      g.add(base, pole);
    });

    // Illuminated steel truss cabinet housing
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(10.8, 4.9, 0.62), this.mats.darkSeat);
    cabinet.position.set(0, 7.9, 0);
    g.add(cabinet);

    // Top structural overhang + dual spotlights
    const hood = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.22, 1.05), this.mats.darkMetal);
    hood.position.set(0, 10.45, 0.25);
    g.add(hood);
    [-3.0, 3.0].forEach((lx) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.24), this.mats.headlight);
      lamp.position.set(lx, 10.32, 0.65);
      g.add(lamp);
    });

    // Vivid unlit LED Billboard Screen
    const mat = this.billboardMats[slotIdx % 4];
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 4.46), mat);
    screen.position.set(0, 7.9, 0.34);
    screen.userData.slotIdx = slotIdx % 4;
    this.billboardMeshes.push(screen);
    g.add(screen);

    return g;
  }

  setBrand(brandObj) {
    if (!brandObj || typeof brandObj !== 'object') return;
    const rawB = Array.isArray(brandObj.billboards) ? brandObj.billboards : DEFAULT_BRAND_3D.billboards;
    this.brand = {
      eventName: String(brandObj.eventName || DEFAULT_BRAND_3D.eventName),
      eventTag: String(brandObj.eventTag || DEFAULT_BRAND_3D.eventTag),
      slogan: String(brandObj.slogan || DEFAULT_BRAND_3D.slogan),
      accentColor: String(brandObj.accentColor || DEFAULT_BRAND_3D.accentColor),
      billboards: [0, 1, 2, 3].map((i) => String(rawB[i] || DEFAULT_BRAND_3D.billboards[i])),
    };
    if (!this.ready) return;
    this._rebuildBillboardMats();
    for (let i = 0; i < this.billboardMeshes.length; i++) {
      const m = this.billboardMeshes[i];
      m.material = this.billboardMats[(m.userData.slotIdx || 0) % 4];
    }
    this.finishGateMapId = -1;
  }

  // ---------- Composite 12-Part Hero Player Bike + Dynamic 3D Cloth FPT Flag ----------
  _buildPlayerBike() {
    const g = new THREE.Group();

    // Grounded contact shadow
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6.2), this.mats.shadow);
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(0, 0.04, 0.2);
    g.add(sh);

    const leanGroup = new THREE.Group();
    g.add(leanGroup);
    this.playerLeanGroup = leanGroup;

    // 1. Front & rear rubber tires + metallic hubs
    const wheelGeo = new THREE.TorusGeometry(0.55, 0.22, 8, 14);
    wheelGeo.rotateY(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.3, 10);
    hubGeo.rotateZ(Math.PI / 2);

    const wF = new THREE.Mesh(wheelGeo, this.mats.tire);
    wF.position.set(0, 0.65, -1.55);
    const hF = new THREE.Mesh(hubGeo, this.mats.rim);
    hF.position.copy(wF.position);
    const wR = new THREE.Mesh(wheelGeo, this.mats.tire);
    wR.position.set(0, 0.65, 1.55);
    const hR = new THREE.Mesh(hubGeo, this.mats.rim);
    hR.position.copy(wR.position);
    leanGroup.add(wF, hF, wR, hR);

    // 2. FPT Blue Scooter Body (Front shield + lower chassis + sleek rear side fairings)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.65, 3.1), this.mats.fptBlue);
    chassis.position.set(0, 1.05, 0.15);
    chassis.castShadow = !this.isSoftwareGl;
    const frontShield = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.65, 0.55), this.mats.fptBlue);
    frontShield.position.set(0, 1.65, -1.25);
    frontShield.rotation.x = 0.22;
    frontShield.castShadow = !this.isSoftwareGl;
    const rearCowl = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.85, 1.65), this.mats.fptBlue);
    rearCowl.position.set(0, 1.32, 1.12);
    rearCowl.castShadow = !this.isSoftwareGl;
    leanGroup.add(chassis, frontShield, rearCowl);

    // 3. Dark leather seat, chrome handlebar, mirrors, bright headlight & taillight
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.34, 1.85), this.mats.darkSeat);
    seat.position.set(0, 1.75, 0.65);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.75, 6), this.mats.chrome);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 2.48, -1.08);
    const headLight = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.36, 0.18), this.mats.headlight);
    headLight.position.set(0, 2.02, -1.56);
    const tailLight = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 0.16), this.mats.taillight);
    tailLight.position.set(0, 1.48, 1.98);
    leanGroup.add(seat, bar, headLight, tailLight);

    // 4. Rider: Dark trousers, FPT Orange Jacket Torso, Arms reaching handlebars
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.45, 0.82), this.mats.fptOrange);
    torso.position.set(0, 2.62, 0.25);
    torso.rotation.x = -0.26;
    torso.castShadow = !this.isSoftwareGl;
    const armGeo = new THREE.CylinderGeometry(0.16, 0.14, 1.25, 6);
    const armL = new THREE.Mesh(armGeo, this.mats.fptOrange);
    armL.position.set(-0.66, 2.55, -0.45);
    armL.rotation.x = 1.25;
    armL.rotation.z = -0.18;
    const armR = new THREE.Mesh(armGeo, this.mats.fptOrange);
    armR.position.set(0.66, 2.55, -0.45);
    armR.rotation.x = 1.25;
    armR.rotation.z = 0.18;
    leanGroup.add(torso, armL, armR);

    // 5. FPT Green Glossy Helmet + Dark Visor
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 12), this.mats.fptGreen);
    helmet.position.set(0, 3.68, 0.02);
    helmet.castShadow = !this.isSoftwareGl;
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.34, 12, 1, true, -Math.PI * 0.35, Math.PI * 0.7), this.mats.glassDark);
    visor.position.set(0, 3.62, 0.02);
    visor.rotation.y = Math.PI;
    leanGroup.add(helmet, visor);

    // 6. Real Wooden Flagpole mounted behind the bike + Dynamic 3D Fluttering FPT Flag!
    const poleGroup = new THREE.Group();
    // Anchored at rear-right luggage rack so the tall wooden pole and fluttering flag read cleanly!
    poleGroup.position.set(0.54, 1.32, 1.72);
    poleGroup.rotation.set(0.15, 0, -0.09);

    // Steel mounting bracket & clamp bolting the wooden pole to the rear of the scooter
    const mountArm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.24), this.mats.darkMetal);
    mountArm.position.set(-0.22, 0.14, -0.05);
    const clampSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.135, 0.56, 10), this.mats.darkMetal);
    clampSleeve.position.set(0, 0.24, 0);
    const clampRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.026, 6, 12), this.mats.chrome);
    clampRing1.rotation.x = Math.PI / 2;
    clampRing1.position.set(0, 0.42, 0);
    const clampRing2 = clampRing1.clone();
    clampRing2.position.set(0, 0.1, 0);
    poleGroup.add(mountArm, clampSleeve, clampRing1, clampRing2);

    // Tall natural wooden pole rising well above the rider's helmet
    const poleLen = 4.35;
    const woodPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.076, 0.102, poleLen, 10),
      this.mats.woodPole
    );
    woodPole.position.set(0, poleLen * 0.5, 0);
    woodPole.castShadow = !this.isSoftwareGl;
    poleGroup.add(woodPole);

    // Brass collar + carved wooden/brass finial knob at pole tip
    const tipCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.12, 10), this.mats.brass);
    tipCollar.position.set(0, poleLen + 0.02, 0);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), this.mats.brass);
    finial.position.set(0, poleLen + 0.16, 0);
    poleGroup.add(tipCollar, finial);

    // Hemp rope lashing rings tying top and bottom of the flag's hoist edge onto the wooden pole
    const tieTop = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.024, 6, 12), this.mats.rope);
    tieTop.rotation.x = Math.PI / 2;
    tieTop.position.set(0, poleLen - 0.18, 0);
    const tieBot = tieTop.clone();
    tieBot.position.set(0, poleLen - 1.68, 0);
    poleGroup.add(tieTop, tieBot);

    // Horizontal rectangular cloth FPT flag lashed along x=0 (hoist edge) and streaming freely to +X / +Z
    const flagW = 2.75;
    const flagH = 1.66;
    const flagGeo = new THREE.PlaneGeometry(flagW, flagH, 16, 5);
    flagGeo.translate(flagW * 0.5, 0, 0); // Pin left hoist edge (x=0) directly to the wooden pole!
    this.flagGeo = flagGeo;
    this.flagBasePos = new Float32Array(flagGeo.attributes.position.array);
    const flagMat = new THREE.MeshStandardMaterial({
      map: makeFlagTexture(this.maxAniso),
      roughness: 0.56,
      metalness: 0.03,
      side: THREE.DoubleSide,
    });
    const flagMesh = new THREE.Mesh(flagGeo, flagMat);
    flagMesh.position.set(0.06, poleLen - 0.94, 0);
    flagMesh.rotation.y = -0.62; // Streams back-and-right so full FPT logo reads clearly left-to-right!
    flagMesh.castShadow = !this.isSoftwareGl;
    poleGroup.add(flagMesh);

    this.flagPoleGroup = poleGroup;
    this.flagMesh = flagMesh;
    leanGroup.add(poleGroup);

    // 7. Translucent Shield Dome & Turbo Exhaust Flame
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.75, 18, 14),
      new THREE.MeshStandardMaterial({
        color: 0x37e05a, emissive: 0x1fc76a, emissiveIntensity: 0.55,
        transparent: true, opacity: 0.24, roughness: 0.1, depthWrite: false,
      })
    );
    this.shieldMesh.position.set(0, 1.9, 0.2);
    this.shieldMesh.visible = false;
    leanGroup.add(this.shieldMesh);

    this.boostFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.85 })
    );
    this.boostFlame.rotation.x = Math.PI / 2;
    this.boostFlame.position.set(0, 0.9, 2.85);
    this.boostFlame.visible = false;
    leanGroup.add(this.boostFlame);

    this.playerGroup = g;
    this.scene.add(g);
  }

  // ---------- Composite High-Contrast 3D Traffic Vehicle Builders ----------
  _createCarMesh() {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 10.2), this.mats.shadow);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    g.add(sh);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3f7fb5, roughness: 0.24, metalness: 0.25 });
    // Sculpted lower chassis + rear bumper + front bumper
    const lower = new THREE.Mesh(new THREE.BoxGeometry(4.25, 1.25, 8.6), bodyMat);
    lower.position.y = 1.08;
    lower.castShadow = !this.isSoftwareGl;
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(4.36, 0.36, 0.42), this.mats.chrome);
    bumperR.position.set(0, 0.68, 4.24);
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(4.32, 0.34, 0.38), this.mats.chrome);
    bumperF.position.set(0, 0.68, -4.24);

    // Greenhouse cabin with glossy sky-tinted wrap-around glass + painted roof cap
    const glassBlock = new THREE.Mesh(new THREE.BoxGeometry(3.62, 1.02, 4.5), this.mats.vehGlass);
    glassBlock.position.set(0, 2.15, 0.15);
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(3.58, 0.28, 3.85), bodyMat);
    roofCap.position.set(0, 2.74, 0.12);
    roofCap.castShadow = !this.isSoftwareGl;
    // Angled bright rear window & front windshield so silhouette reads instantly from behind
    const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.92), this.mats.vehGlass);
    rearGlass.position.set(0, 2.22, 2.43);
    rearGlass.rotation.x = -0.34;
    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.92), this.mats.vehGlass);
    frontGlass.position.set(0, 2.22, -2.14);
    frontGlass.rotation.y = Math.PI;
    frontGlass.rotation.x = -0.34;

    // Side mirrors
    const mirL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.26, 0.32), bodyMat);
    mirL.position.set(-2.22, 1.78, -1.15);
    const mirR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.26, 0.32), bodyMat);
    mirR.position.set(2.22, 1.78, -1.15);

    // Wide high-visibility glowing LED taillights + license plate + headlights
    const tlBar = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.2, 0.14), this.mats.taillight);
    tlBar.position.set(0, 1.38, 4.32);
    const tlL = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.44, 0.18), this.mats.taillight);
    tlL.position.set(-1.52, 1.38, 4.33);
    const tlR = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.44, 0.18), this.mats.taillight);
    tlR.position.set(1.52, 1.38, 4.33);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.42), this.mats.plateMat);
    plate.position.set(0, 0.98, 4.34);
    const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.16), this.mats.headlight);
    hlL.position.set(-1.45, 1.24, -4.32);
    const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.16), this.mats.headlight);
    hlR.position.set(1.45, 1.24, -4.32);

    // 4 Wheels with bright silver alloy rims
    const wGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.48, 12);
    wGeo.rotateZ(Math.PI / 2);
    const rGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.54, 10);
    rGeo.rotateZ(Math.PI / 2);
    [[-2.06, -2.55], [2.06, -2.55], [-2.06, 2.55], [2.06, 2.55]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wGeo, this.mats.tire);
      w.position.set(wx, 0.62, wz);
      const rim = new THREE.Mesh(rGeo, this.mats.rim);
      rim.position.set(wx, 0.62, wz);
      g.add(w, rim);
    });

    g.add(lower, bumperR, bumperF, glassBlock, roofCap, rearGlass, frontGlass, mirL, mirR, tlBar, tlL, tlR, plate, hlL, hlR);
    g.userData.bodyMat = bodyMat;
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  _createBusMesh() {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 16.8), this.mats.shadow);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    g.add(sh);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf26f21, roughness: 0.28, metalness: 0.16 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.95, 3.65, 15.2), bodyMat);
    body.position.y = 2.42;
    body.castShadow = !this.isSoftwareGl;

    // Crisp white roof + dual AC units + top rear marker lights
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.82, 0.34, 14.9), this.mats.whiteTrim);
    roof.position.y = 4.35;
    const ac1 = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.46, 3.2), this.mats.concrete);
    ac1.position.set(0, 4.65, -2.8);
    const ac2 = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.46, 3.2), this.mats.concrete);
    ac2.position.set(0, 4.65, 3.0);

    // Panoramic reflective side & rear windows + white body accent band
    const winBand = new THREE.Mesh(new THREE.BoxGeometry(5.06, 1.45, 14.3), this.mats.vehGlass);
    winBand.position.y = 3.0;
    const whiteBelt = new THREE.Mesh(new THREE.BoxGeometry(5.04, 0.34, 15.26), this.mats.whiteTrim);
    whiteBelt.position.y = 1.98;
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(5.08, 0.42, 0.4), this.mats.chrome);
    rearBumper.position.set(0, 0.78, 7.58);

    // Tall vertical glowing red taillights + roof red markers + license plate
    const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.18), this.mats.taillight);
    tlL.position.set(-2.02, 1.55, 7.64);
    const tlR = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.18), this.mats.taillight);
    tlR.position.set(2.02, 1.55, 7.64);
    const topL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.24, 0.18), this.mats.taillight);
    topL.position.set(-2.05, 4.18, 7.64);
    const topR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.24, 0.18), this.mats.taillight);
    topR.position.set(2.05, 4.18, 7.64);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.46), this.mats.plateMat);
    plate.position.set(0, 1.15, 7.65);

    // Roof label plate (undistorted 4:1 ratio!) AND Rear Destination Signboard (readable directly from player camera!)
    const signMat = this._getSignMat('FPT BUS', '#f26f21', true);
    const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.35), signMat);
    labelPlane.rotation.x = -Math.PI / 2;
    labelPlane.position.set(0, 4.54, 5.75);
    const rearSign = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 1.0), signMat);
    rearSign.position.set(0, 3.12, 7.66);

    const wGeo = new THREE.CylinderGeometry(0.76, 0.76, 0.56, 12);
    wGeo.rotateZ(Math.PI / 2);
    const rGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.62, 10);
    rGeo.rotateZ(Math.PI / 2);
    [[-2.38, -4.8], [2.38, -4.8], [-2.38, 4.8], [2.38, 4.8]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wGeo, this.mats.tire);
      w.position.set(wx, 0.76, wz);
      const rim = new THREE.Mesh(rGeo, this.mats.rim);
      rim.position.set(wx, 0.76, wz);
      g.add(w, rim);
    });
    g.add(body, roof, ac1, ac2, winBand, whiteBelt, rearBumper, tlL, tlR, topL, topR, plate, labelPlane, rearSign);
    g.userData.bodyMat = bodyMat;
    g.userData.labelMesh = labelPlane;
    g.userData.rearSign = rearSign;
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  _createTruckMesh() {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 18.6), this.mats.shadow);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    g.add(sh);

    const cabMat = new THREE.MeshStandardMaterial({ color: 0x355c7d, roughness: 0.3, metalness: 0.25 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4.65, 3.25, 4.3), cabMat);
    cab.position.set(0, 2.3, -6.2);
    cab.castShadow = !this.isSoftwareGl;
    const deflector = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 2.8), this.mats.whiteTrim);
    deflector.position.set(0, 4.25, -5.6);
    deflector.rotation.x = 0.25;
    const win = new THREE.Mesh(new THREE.BoxGeometry(4.74, 1.25, 2.25), this.mats.vehGlass);
    win.position.set(0, 2.82, -6.95);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.95, 0.16), this.mats.chrome);
    grille.position.set(0, 1.55, -8.38);

    // Corrugated freight cargo container + detailed double rear doors with red/white reflective bumper
    const cargoMats = [
      this.mats.truckCargo, // +x right
      this.mats.truckCargo, // -x left
      this.mats.whiteTrim,  // +y roof
      this.mats.darkMetal,  // -y bottom
      this.mats.truckRear,  // +z rear doors facing player!
      this.mats.concrete,   // -z front bulkhead
    ];
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(5.15, 4.45, 12.6), cargoMats);
    cargo.position.set(0, 3.05, 2.2);
    cargo.castShadow = !this.isSoftwareGl;

    const rearStep = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.34, 0.45), this.mats.darkMetal);
    rearStep.position.set(0, 0.65, 8.58);
    const tlL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.44, 0.2), this.mats.taillight);
    tlL.position.set(-1.88, 1.15, 8.56);
    const tlR = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.44, 0.2), this.mats.taillight);
    tlR.position.set(1.88, 1.15, 8.56);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.44), this.mats.plateMat);
    plate.position.set(0, 1.05, 8.58);

    const wGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.62, 12);
    wGeo.rotateZ(Math.PI / 2);
    const rGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.68, 10);
    rGeo.rotateZ(Math.PI / 2);
    [[-2.42, -6.2], [2.42, -6.2], [-2.42, 2.8], [2.42, 2.8], [-2.42, 5.8], [2.42, 5.8]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wGeo, this.mats.tire);
      w.position.set(wx, 0.78, wz);
      const rim = new THREE.Mesh(rGeo, this.mats.rim);
      rim.position.set(wx, 0.78, wz);
      g.add(w, rim);
    });
    g.add(cab, deflector, win, grille, cargo, rearStep, tlL, tlR, plate);
    g.userData.bodyMat = cabMat;
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  _createNpcBikeMesh() {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 5.2), this.mats.shadow);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    g.add(sh);

    const bikeMat = new THREE.MeshStandardMaterial({ color: 0xc23b32, roughness: 0.3, metalness: 0.22 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x8ea0ae, roughness: 0.62 });
    const helmMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.22, metalness: 0.15 });

    // Real front & rear wheels + silver hubs
    const wGeo = new THREE.TorusGeometry(0.48, 0.19, 7, 12);
    wGeo.rotateY(Math.PI / 2);
    const hGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.26, 8);
    hGeo.rotateZ(Math.PI / 2);
    const wF = new THREE.Mesh(wGeo, this.mats.tire);
    wF.position.set(0, 0.56, -1.38);
    const hF = new THREE.Mesh(hGeo, this.mats.rim);
    hF.position.copy(wF.position);
    const wR = new THREE.Mesh(wGeo, this.mats.tire);
    wR.position.set(0, 0.56, 1.38);
    const hR = new THREE.Mesh(hGeo, this.mats.rim);
    hR.position.copy(wR.position);

    // Sculpted scooter body (lower deck + front shield + rear cowl + seat + handlebars + bright brake light!)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.56, 2.75), bikeMat);
    chassis.position.set(0, 0.92, 0.08);
    chassis.castShadow = !this.isSoftwareGl;
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.48, 0.46), bikeMat);
    shield.position.set(0, 1.46, -1.1);
    shield.rotation.x = 0.2;
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.74, 1.42), bikeMat);
    cowl.position.set(0, 1.18, 0.96);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.28, 1.6), this.mats.darkSeat);
    seat.position.set(0, 1.56, 0.52);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.62, 6), this.mats.chrome);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 2.22, -0.92);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.28, 0.16), this.mats.taillight);
    tail.position.set(0, 1.32, 1.72);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.34), this.mats.plateMat);
    plate.position.set(0, 0.88, 1.72);

    // Expressive rider (torso + arms + glossy helmet with dark visor)
    const rider = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.38, 0.78), shirtMat);
    rider.position.set(0, 2.42, 0.18);
    rider.rotation.x = -0.22;
    rider.castShadow = !this.isSoftwareGl;
    const armGeo = new THREE.CylinderGeometry(0.14, 0.13, 1.12, 6);
    const armL = new THREE.Mesh(armGeo, shirtMat);
    armL.position.set(-0.62, 2.32, -0.4);
    armL.rotation.set(1.2, 0, -0.18);
    const armR = new THREE.Mesh(armGeo, shirtMat);
    armR.position.set(0.62, 2.32, -0.4);
    armR.rotation.set(1.2, 0, 0.18);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 10), helmMat);
    helm.position.set(0, 3.42, -0.02);
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.3, 10, 1, true, -Math.PI * 0.36, Math.PI * 0.72),
      this.mats.glassDark
    );
    visor.position.set(0, 3.36, -0.02);
    visor.rotation.y = Math.PI;

    // Ninja Lead oversized sun-protection cape/hoodie skirt
    const ninjaCape = new THREE.Mesh(new THREE.ConeGeometry(1.18, 1.55, 8), shirtMat);
    ninjaCape.position.set(0, 1.92, 0.25);
    ninjaCape.visible = false;

    // Branded Shipper insulated thermal delivery box + white reflective stripe
    const shipBox = new THREE.Group();
    const sCube = new THREE.Mesh(new THREE.BoxGeometry(1.58, 1.38, 1.52), this.mats.fptOrange);
    const sBand = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.24, 1.58), this.mats.whiteTrim);
    sBand.position.y = 0.22;
    shipBox.add(sCube, sBand);
    shipBox.position.set(0, 2.08, 1.32);
    shipBox.visible = false;

    // Large glowing amber turn signals (clearly readable when Shipper/Ninja blinks!)
    const blL = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), this.mats.blinkOn);
    blL.position.set(-1.12, 1.45, 1.65);
    blL.visible = false;
    const blR = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), this.mats.blinkOn);
    blR.position.set(1.12, 1.45, 1.65);
    blR.visible = false;

    // Crisp floating warning triangle sprite (!) for Ninja Lead swerve
    const warnOrb = new THREE.Sprite(this.mats.warnSprite);
    warnOrb.scale.set(2.1, 2.1, 1);
    warnOrb.position.set(0, 4.95, 0);
    warnOrb.visible = false;

    g.add(wF, hF, wR, hR, chassis, shield, cowl, seat, bar, tail, plate, rider, armL, armR, helm, visor, ninjaCape, shipBox, blL, blR, warnOrb);
    g.userData = { bikeMat, shirtMat, helmMat, ninjaCape, shipBox, blL, blR, warnOrb };
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  // ---------- High-Craft 3D Road Items & Obstacles Pool Builders ----------
  _createPickupMesh(kind) {
    const g = new THREE.Group();
    const accentHex = kind === 'coffee' ? 0xff9d2e : 0x37f06a;
    // Glowing ground halo ring + subtle upward light beacon
    const ringMat = new THREE.MeshBasicMaterial({
      color: accentHex, transparent: true, opacity: 0.86, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 2.05, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    const innerDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 20),
      new THREE.MeshBasicMaterial({ color: accentHex, transparent: true, opacity: 0.22, depthWrite: false })
    );
    innerDisc.rotation.x = -Math.PI / 2;
    innerDisc.position.y = 0.06;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.7, 3.1, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: accentHex, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 1.55;
    g.add(ring, innerDisc, beam);

    const spin = new THREE.Group();
    spin.position.y = 1.9;
    g.add(spin);
    g.userData.spin = spin;
    g.userData.ring = ring;

    if (kind === 'coffee') {
      // Iconic Layered Vietnamese Iced Milk Coffee (Cà Phê Sữa Đá)
      const milkBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.56, 0.58, 14),
        new THREE.MeshStandardMaterial({ color: 0xf7e6c4, roughness: 0.28 })
      );
      milkBase.position.y = -0.62;
      const coffeeBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.86, 0.68, 1.12, 14),
        new THREE.MeshStandardMaterial({ color: 0x5c2e12, roughness: 0.18, metalness: 0.06 })
      );
      coffeeBody.position.y = 0.18;
      const foam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.88, 0.86, 0.22, 14),
        new THREE.MeshStandardMaterial({ color: 0xd9a870, roughness: 0.35 })
      );
      foam.position.y = 0.8;
      const lidRim = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.09, 8, 16), this.mats.whiteTrim);
      lidRim.rotation.x = Math.PI / 2;
      lidRim.position.y = 0.92;
      const domeLid = new THREE.Mesh(
        new THREE.SphereGeometry(0.84, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
        new THREE.MeshStandardMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.45, roughness: 0.1 })
      );
      domeLid.position.y = 0.92;
      const straw = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.095, 1.55, 8),
        new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0x440800, roughness: 0.25 })
      );
      straw.position.set(0.24, 1.48, 0);
      straw.rotation.z = -0.26;
      spin.add(milkBase, coffeeBody, foam, lidRim, domeLid, straw);
    } else {
      // Sculpted Vietnamese Bánh Mì (scored golden baguette + lettuce + chili + paper wrap)
      const banh = new THREE.Group();
      const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.45, 8, 12), this.mats.banhMiCrust);
      loaf.rotation.z = Math.PI / 2.65;
      const paperWrap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.66, 0.66, 0.72, 12),
        this.mats.whiteTrim
      );
      paperWrap.rotation.z = Math.PI / 2.65;
      paperWrap.position.set(-0.22, -0.1, 0);
      const lettuce = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 1.38, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x45d658, roughness: 0.55 })
      );
      lettuce.rotation.z = Math.PI / 2.65;
      lettuce.position.set(0.18, 0.32, 0.36);
      const chili = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.85, 0.24),
        new THREE.MeshStandardMaterial({ color: 0xff3528, roughness: 0.35 })
      );
      chili.rotation.z = Math.PI / 2.65;
      chili.position.set(0.22, 0.38, 0.44);
      banh.add(loaf, paperWrap, lettuce, chili);

      // Fresh Trimmed Danang Coconut (Nước Dừa Mát — Map 3)
      const coco = new THREE.Group();
      const nut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.76, 0.88, 1.25, 12),
        new THREE.MeshStandardMaterial({ color: 0x3db849, roughness: 0.38 })
      );
      const coneTop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.76, 0.52, 12),
        this.mats.whiteTrim
      );
      coneTop.position.y = 0.86;
      const straw = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.085, 1.35, 8),
        new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.28 })
      );
      straw.position.set(0.2, 1.38, 0);
      straw.rotation.z = -0.32;
      coco.add(nut, coneTop, straw);
      coco.visible = false;

      spin.add(banh, coco);
      g.userData.banh = banh;
      g.userData.coco = coco;
    }
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  _createBarrierMesh() {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 3.2), this.mats.shadow);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    g.add(sh);

    // Double-plank high-visibility reflective A-frame construction barricade
    const boardTop = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.05, 0.45), this.mats.barrierStripe);
    boardTop.position.y = 1.92;
    boardTop.castShadow = !this.isSoftwareGl;
    const boardLow = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.65, 0.45), this.mats.barrierStripe);
    boardLow.position.y = 0.92;
    boardLow.castShadow = !this.isSoftwareGl;

    // Angled A-frame dark metal legs
    [-3.5, 3.5].forEach((lx) => {
      const legF = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.55, 0.24), this.mats.darkMetal);
      legF.position.set(lx, 1.22, 0.36);
      legF.rotation.x = -0.22;
      const legB = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.55, 0.24), this.mats.darkMetal);
      legB.position.set(lx, 1.22, -0.36);
      legB.rotation.x = 0.22;
      g.add(legF, legB);
    });

    // Flanking orange/white reflective traffic cones
    [-4.75, 4.75].forEach((cx) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 1.1), this.mats.darkSeat);
      base.position.set(cx, 0.08, 0.35);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.45, 10), this.mats.fptOrange);
      cone.position.set(cx, 0.85, 0.35);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.28, 10), this.mats.whiteTrim);
      band.position.set(cx, 0.95, 0.35);
      g.add(base, cone, band);
    });

    // Bright flashing amber strobe lights on top
    const beaconL = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), this.mats.blinkOn);
    beaconL.position.set(-3.5, 2.75, 0);
    const beaconR = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), this.mats.blinkOn);
    beaconR.position.set(3.5, 2.75, 0);
    g.add(boardTop, boardLow, beaconL, beaconR);
    g.userData = { beaconL, beaconR };
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  _createCartMesh() {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 6.2), this.mats.shadow);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    g.add(sh);

    const wood = new THREE.MeshStandardMaterial({ color: 0xb67538, roughness: 0.72 });
    const trim = this.mats.darkMetal;
    // Cart body + display tray + rear push handles
    const box = new THREE.Mesh(new THREE.BoxGeometry(3.15, 1.38, 4.55), wood);
    box.position.y = 1.42;
    box.castShadow = !this.isSoftwareGl;
    const rimTop = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.16, 4.72), trim);
    rimTop.position.y = 2.12;
    const handleL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.15, 6), trim);
    handleL.rotation.x = Math.PI / 2.2;
    handleL.position.set(-1.15, 1.85, 2.72);
    const handleR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.15, 6), trim);
    handleR.rotation.x = Math.PI / 2.2;
    handleR.position.set(1.15, 1.85, 2.72);

    // Spoked cart wheels on left & right sides
    const wGeo = new THREE.TorusGeometry(0.76, 0.14, 7, 14);
    wGeo.rotateY(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 8);
    hubGeo.rotateZ(Math.PI / 2);
    [-1.72, 1.72].forEach((wx) => {
      const w = new THREE.Mesh(wGeo, this.mats.darkSeat);
      w.position.set(wx, 0.82, 0.2);
      const hub = new THREE.Mesh(hubGeo, this.mats.rim);
      hub.position.set(wx, 0.82, 0.2);
      g.add(w, hub);
    });

    // Colorful tropical fruit stacks on cart tray
    const fruitMats = [
      new THREE.MeshStandardMaterial({ color: 0xf24838, roughness: 0.42 }),
      new THREE.MeshStandardMaterial({ color: 0xffce38, roughness: 0.42 }),
      new THREE.MeshStandardMaterial({ color: 0x45c852, roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ color: 0xff8a24, roughness: 0.42 }),
    ];
    [
      [-0.72, 2.48, -1.25, 0.62, 0], [0.68, 2.52, -1.1, 0.64, 1],
      [-0.65, 2.45, 0.15, 0.6, 2], [0.72, 2.46, 0.35, 0.58, 3],
      [-0.55, 2.42, 1.45, 0.56, 1], [0.62, 2.42, 1.4, 0.58, 0],
    ].forEach(([fx, fy, fz, fr, mi]) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(fr, 8, 8), fruitMats[mi]);
      f.position.set(fx, fy, fz);
      g.add(f);
    });

    // Iconic Vietnamese street-vendor striped umbrella/canopy on slim pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.65, 6), this.mats.chrome);
    pole.position.set(0, 3.35, -0.3);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(2.35, 0.92, 8),
      new THREE.MeshStandardMaterial({ color: 0xe64532, roughness: 0.55 })
    );
    canopy.position.set(0, 4.55, -0.3);
    const canopyRim = new THREE.Mesh(new THREE.CylinderGeometry(2.32, 2.38, 0.24, 8, 1, true), this.mats.whiteTrim);
    canopyRim.position.set(0, 4.02, -0.3);

    g.add(box, rimTop, handleL, handleR, pole, canopy, canopyRim);
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  _createWaterMesh(isFlood) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      isFlood ? this.mats.floodPool : this.mats.waterPool
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.045;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  _createHoleMesh() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), this.mats.pothole);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.05;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  _createBoostPadMesh() {
    const mat = new THREE.MeshBasicMaterial({
      map: this.boostPadTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 8.8), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.055;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  // ---------- 3D Overhead Traffic Light Gantry + Live LED Countdown Timers ----------
  _createIntersectionMesh() {
    const g = new THREE.Group();
    // Crossroad asphalt bar
    const crossRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 17),
      new THREE.MeshStandardMaterial({ color: 0x3b434b, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -1 })
    );
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.set(0, 0.025, -12.5);
    g.add(crossRoad);

    // Crisp zebra crosswalk stripes
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf4f0e4, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let x = -ROAD_HALF + 1.4; x <= ROAD_HALF - 1.4; x += 2.4) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 3.0), stripeMat);
      st.rotation.x = -Math.PI / 2;
      st.position.set(x, 0.04, -2.3);
      g.add(st);
    }

    // Stop line + subtle red warning band behind stop line when RED!
    const stopMat = new THREE.MeshBasicMaterial({ color: 0xf4f0e4, polygonOffset: true, polygonOffsetFactor: -2 });
    const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 - 1.0, 0.85), stopMat);
    stopLine.rotation.x = -Math.PI / 2;
    stopLine.position.set(0, 0.055, 0);
    const stopGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30, transparent: true, opacity: 0.28, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    const stopGlow = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 - 1.0, 2.8), stopGlowMat);
    stopGlow.rotation.x = -Math.PI / 2;
    stopGlow.position.set(0, 0.045, 1.4);
    stopGlow.visible = false;
    g.add(stopLine, stopGlow);

    // Tall Steel Overhead Gantry Arch spanning the road (lowered slightly to y=8.9 for prime framing!)
    const poleL = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 9.2, 8), this.mats.darkMetal);
    poleL.position.set(-ROAD_HALF - 1.3, 4.6, -0.5);
    const poleR = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 9.2, 8), this.mats.darkMetal);
    poleR.position.set(ROAD_HALF + 1.3, 4.6, -0.5);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 3.4, 0.6, 0.6), this.mats.darkMetal);
    beam.position.set(0, 8.95, -0.5);
    g.add(poleL, poleR, beam);

    // Vivid unlit signal bulb materials (always bright against sky!)
    const redMat = new THREE.MeshBasicMaterial({ color: 0x351616, toneMapped: false });
    const yelMat = new THREE.MeshBasicMaterial({ color: 0x352d14, toneMapped: false });
    const grnMat = new THREE.MeshBasicMaterial({ color: 0x15351e, toneMapped: false });
    const ledInitMat = this._getLedCountdownMat('r', 5);
    const ledScreens = [];

    // Dual Overhead Signal Assemblies: 3 hooded lights + LARGE LED Countdown Display side-by-side!
    [-6.0, 5.4].forEach((hx) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.78, 0.92), this.mats.darkSeat);
      box.position.set(hx - 1.15, 8.95, -0.05);
      // Chrome visor hood above signal head
      const visor = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.18, 0.78), this.mats.darkMetal);
      visor.position.set(hx - 1.15, 9.88, 0.38);

      const bR = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), redMat);
      bR.position.set(hx - 2.55, 8.95, 0.44);
      const bY = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), yelMat);
      bY.position.set(hx - 1.15, 8.95, 0.44);
      const bG = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), grnMat);
      bG.position.set(hx + 0.25, 8.95, 0.44);

      // Large crisp LED Countdown Display housing right beside the lights!
      const ledBox = new THREE.Mesh(new THREE.BoxGeometry(2.95, 2.35, 0.92), this.mats.darkSeat);
      ledBox.position.set(hx + 2.65, 8.95, -0.05);
      const ledFace = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 2.15), ledInitMat);
      ledFace.position.set(hx + 2.65, 8.95, 0.44);
      ledScreens.push(ledFace);

      g.add(box, visor, bR, bY, bG, ledBox, ledFace);
    });

    // Roadside Vertical Signal + LED Countdown on Right Pole (visible even right up at stop line!)
    const sideBox = new THREE.Mesh(new THREE.BoxGeometry(1.35, 3.35, 0.75), this.mats.darkSeat);
    sideBox.position.set(ROAD_HALF + 1.3, 4.95, 0.15);
    const sbR = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), redMat);
    sbR.position.set(ROAD_HALF + 1.3, 5.95, 0.55);
    const sbY = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), yelMat);
    sbY.position.set(ROAD_HALF + 1.3, 4.95, 0.55);
    const sbG = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), grnMat);
    sbG.position.set(ROAD_HALF + 1.3, 3.95, 0.55);
    const sideLedBox = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.48, 0.75), this.mats.darkSeat);
    sideLedBox.position.set(ROAD_HALF + 1.3, 7.25, 0.15);
    const sideLedFace = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.32), ledInitMat);
    sideLedFace.position.set(ROAD_HALF + 1.3, 7.25, 0.55);
    ledScreens.push(sideLedFace);
    g.add(sideBox, sbR, sbY, sbG, sideLedBox, sideLedFace);

    // Cross-traffic 3D cars zooming left/right during red lights
    const crossCar1 = this._createMiniCrossCar(0xd93c32);
    const crossCar2 = this._createMiniCrossCar(0x2d86cf);
    crossCar1.position.set(0, 0, -16.5);
    crossCar2.position.set(0, 0, -9.0);
    g.add(crossCar1, crossCar2);

    g.userData = { stopMat, stopGlow, redMat, yelMat, grnMat, ledScreens, lastLedKey: '', crossCar1, crossCar2 };
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  _createMiniCrossCar(col) {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 5.0), this.mats.shadow);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.04;
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.28, metalness: 0.25 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.3, 4.1), mat);
    b.position.y = 1.05;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.05, 3.5), this.mats.vehGlass);
    cab.position.y = 2.15;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 3.4), mat);
    roof.position.y = 2.72;
    const wGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.45, 10);
    wGeo.rotateX(Math.PI / 2);
    [[-2.5, -2.0], [2.5, -2.0], [-2.5, 2.0], [2.5, 2.0]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wGeo, this.mats.tire);
      w.position.set(wx, 0.58, wz);
      g.add(w);
    });
    g.add(sh, b, cab, roof);
    g.visible = false;
    return g;
  }

  _buildFinishGate() {
    const g = new THREE.Group();
    // Grand FPT Welcome Plaza beyond finish gate
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 65),
      new THREE.MeshStandardMaterial({ color: 0xd6dcd6, roughness: 0.78 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.03, -32.5);
    g.add(plaza);

    // Monumental twin pillars
    const pilL = new THREE.Mesh(new THREE.BoxGeometry(2.6, 12.0, 2.6), this.mats.whiteTrim);
    pilL.position.set(-ROAD_HALF - 1.5, 6.0, 0);
    const pilR = new THREE.Mesh(new THREE.BoxGeometry(2.6, 12.0, 2.6), this.mats.whiteTrim);
    pilR.position.set(ROAD_HALF + 1.5, 6.0, 0);
    g.add(pilL, pilR);

    // Grand FPT Tri-color Portal Beam
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 5.8, 4.2, 2.4), this.mats.fptOrange);
    beam.position.set(0, 10.6, 0);
    g.add(beam);

    this.finishSignMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 });
    const signFace = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 3.2, 3.6), this.finishSignMat);
    signFace.position.set(0, 10.6, 1.24);
    g.add(signFace);

    // Automated Face-Scan turnstile kiosks below gate
    [-7.5, 0, 7.5].forEach((kx) => {
      const kiosk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, 1.8), this.mats.darkMetal);
      kiosk.position.set(kx, 1.2, -1.6);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.15), this.mats.fptGreen);
      glow.position.set(kx, 1.9, -0.68);
      g.add(kiosk, glow);
    });

    g.visible = false;
    this.finishGate = g;
    this.scene.add(g);
  }

  _buildPools() {
    this.vehPools = {
      car: Array.from({ length: 20 }, () => this._createCarMesh()),
      bus: Array.from({ length: 8 }, () => this._createBusMesh()),
      truck: Array.from({ length: 8 }, () => this._createTruckMesh()),
      bike: Array.from({ length: 24 }, () => this._createNpcBikeMesh()),
    };
    this.itemPools = {
      coffee: Array.from({ length: 12 }, () => this._createPickupMesh('coffee')),
      banh: Array.from({ length: 12 }, () => this._createPickupMesh('banh')),
      barrier: Array.from({ length: 10 }, () => this._createBarrierMesh()),
      cart: Array.from({ length: 8 }, () => this._createCartMesh()),
      flood: Array.from({ length: 8 }, () => this._createWaterMesh(true)),
      water: Array.from({ length: 10 }, () => this._createWaterMesh(false)),
      hole: Array.from({ length: 14 }, () => this._createHoleMesh()),
      boostpad: Array.from({ length: 8 }, () => this._createBoostPadMesh()),
    };
    this.lightPool = Array.from({ length: 3 }, () => this._createIntersectionMesh());
  }

  _buildWeatherEffects() {
    // 3D Rain streaks (LineSegments)
    const rCount = 120;
    const rPos = new Float32Array(rCount * 6);
    for (let i = 0; i < rCount; i++) {
      const rx = (Math.random() - 0.5) * 44;
      const ry = Math.random() * 26;
      const rz = -Math.random() * 65 + 14;
      rPos[i * 6] = rx; rPos[i * 6 + 1] = ry; rPos[i * 6 + 2] = rz;
      rPos[i * 6 + 3] = rx - 0.45; rPos[i * 6 + 4] = ry - 2.4; rPos[i * 6 + 5] = rz + 0.4;
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
    this.rainLines = new THREE.LineSegments(
      rGeo,
      new THREE.LineBasicMaterial({ color: 0xc8e8ff, transparent: true, opacity: 0.5 })
    );
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);

    // 3D Crosswind streaks
    const wCount = 36;
    const wPos = new Float32Array(wCount * 6);
    for (let i = 0; i < wCount; i++) {
      const wx = (Math.random() - 0.5) * 48;
      const wy = 1.5 + Math.random() * 14;
      const wz = -Math.random() * 58 + 10;
      wPos[i * 6] = wx; wPos[i * 6 + 1] = wy; wPos[i * 6 + 2] = wz;
      wPos[i * 6 + 3] = wx + 5.5; wPos[i * 6 + 4] = wy; wPos[i * 6 + 5] = wz;
    }
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    this.windLines = new THREE.LineSegments(
      wGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
    );
    this.windLines.visible = false;
    this.scene.add(this.windLines);

    // 3D Spark/Splash Particles via InstancedMesh (1 draw call!)
    const pGeo = new THREE.SphereGeometry(0.32, 6, 5);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.partMesh = new THREE.InstancedMesh(pGeo, pMat, 64);
    this.partMesh.count = 0;
    this.partMesh.frustumCulled = false;
    this.scene.add(this.partMesh);
  }

  resize(w, h) {
    if (!this.ready || !w || !h) return;
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  project(wx, wy, height, py, out) {
    if (!this.ready) return false;
    _v3.set(wx * SC, height, -(wy - py) * SC);
    _v3.project(this.camera);
    if (_v3.z > 1 || _v3.z < -1) return false;
    out.x = (_v3.x * 0.5 + 0.5) * this.width;
    out.y = (-_v3.y * 0.5 + 0.5) * this.height;
    return true;
  }

  render(snap) {
    if (!this.ready || this.contextLost) return;
    const {
      dt, now, campus, mapName, mode, play, route, st,
      vehicles, items, lights, lightState, live, parts, reduce,
    } = snap;

    if (this.curMapId !== campus) this.setMap(campus);
    const theme = THEMES[campus] || THEMES[0];
    const py = st.py;
    const safeDt = Math.min(0.05, dt || 0.016);

    // 1. Dynamic Weather Sky & Fog Blending (smooth exponential damping)
    let targetSky = theme.sky;
    let targetFog = theme.fogNear;
    if (st.inRain && theme.rainSky) { targetSky = theme.rainSky; targetFog = theme.rainFog; }
    else if (st.inFog && theme.fogSky) { targetSky = theme.fogSky; targetFog = theme.heavyFog; }
    else if (st.inHeat && theme.heatSky) { targetSky = theme.heatSky; targetFog = theme.heatFog; }

    _cA.setHex(targetSky);
    this.scene.background.lerp(_cA, 1 - Math.exp(-3.2 * safeDt));
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.density = THREE.MathUtils.damp(this.scene.fog.density, targetFog, 3.2, safeDt);

    // Wet sheen on asphalt in rain
    this.roadMat.roughness = THREE.MathUtils.damp(this.roadMat.roughness, st.inRain ? 0.24 : 0.78, 3.0, safeDt);

    // 2. Scroll Road, Ocean & Infinite 3D Campus Chunks
    const roadTex = this.roadTextures[campus];
    if (roadTex) {
      // 480 units / 16 repeat = 30 units per texture tile
      roadTex.offset.y = -((py * SC) / 30) % 1;
    }
    if (this.oceanMesh.visible) {
      this.oceanTex.offset.y = -((py * SC) / 48) % 1;
      this.oceanTex.offset.x = Math.sin(now * 0.0016) * 0.035;
    }
    const totalSpan = CHUNK_LEN * CHUNK_COUNT;
    const baseOffset = (py * SC) % totalSpan;
    for (let i = 0; i < CHUNK_COUNT; i++) {
      let z = 38 - i * CHUNK_LEN + baseOffset;
      while (z > 52) z -= totalSpan;
      while (z < 52 - totalSpan) z += totalSpan;
      this.chunks[i].position.z = z;
    }
    // Sway Danang coconut palm crowns in crosswind!
    if (campus === 3 && !reduce && this.palmRefs.length) {
      const windPush = (st.windForce || 0) * 0.0028;
      for (let i = 0; i < this.palmRefs.length; i++) {
        this.palmRefs[i].rotation.z = windPush + Math.sin(now * 0.0024 + i) * 0.08;
      }
    }

    // 3. Camera Choreography (Adaptive Desktop vs Portrait Mobile + Dynamic Speed FOV + Shake)
    const portrait = this.width / Math.max(1, this.height) < 0.85;
    const targetCamX = st.x * SC * (portrait ? 0.36 : 0.44);
    const speedRatio = THREE.MathUtils.clamp((st.speed || 0) / 360, 0, 1.35);
    const feverOn = (st.fever || 0) > 0;
    const targetFov = (portrait ? 49 : 44) + speedRatio * 4.5 + (st.boost > 0 ? 3.5 : 0) + (feverOn ? 4.8 : 0);
    const targetRoll = reduce ? 0 : -(st.lean || 0) * 0.045;

    this.camX = THREE.MathUtils.damp(this.camX, targetCamX, 8.5, safeDt);
    this.camFov = THREE.MathUtils.damp(this.camFov, targetFov, 5.0, safeDt);
    this.camRoll = THREE.MathUtils.damp(this.camRoll, targetRoll, 9.0, safeDt);

    if (Math.abs(this.camera.fov - this.camFov) > 0.04) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
    const shakeX = (st.shake > 0 && !reduce) ? (Math.random() - 0.5) * 1.1 * st.shake : 0;
    const shakeY = (st.shake > 0 && !reduce) ? (Math.random() - 0.5) * 0.9 * st.shake : 0;

    const camY = portrait ? 28.0 : 20.0;
    const camZ = portrait ? 30.5 : 23.6;
    this.camera.position.set(this.camX + shakeX, camY + shakeY, camZ);
    this.camera.lookAt(this.camX * 1.12, 0.4, portrait ? -14.0 : -17.5);
    this.camera.rotation.z += this.camRoll;

    // 4. Update Hero Player Scooter & Real-Time 3D Cloth FPT Flag
    const blinkHide = st.inv > 0 && Math.floor(st.t * 12) % 2 === 0;
    this.playerGroup.visible = !blinkHide;
    this.playerGroup.position.set(st.x * SC, 0, 0);
    this.playerLeanGroup.rotation.z = -(st.lean || 0) * 0.72;
    this.playerLeanGroup.rotation.y = -(st.lean || 0) * 0.14;
    this.shieldMesh.visible = st.shield > 0;
    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.y = now * 0.002;
      const scS = 1 + Math.sin(now * 0.006) * 0.04;
      this.shieldMesh.scale.setScalar(scS);
    }
    this.boostFlame.visible = (st.boost > 0 || feverOn) && !reduce;
    if (this.boostFlame.visible) {
      const fMul = feverOn ? 1.48 : 1.0;
      this.boostFlame.scale.set(
        (0.85 + Math.random() * 0.35) * fMul,
        (0.8 + Math.random() * 0.65) * (feverOn ? 1.65 : 1.0),
        (0.85 + Math.random() * 0.35) * fMul
      );
    }

    // Animate tall wooden flagpole elastic flex + dynamic 3D cloth FPT flag billowing in the wind
    const phase = st.flagPhase || 0;
    const lean = st.lean || 0;
    const windF = st.windForce || 0;
    if (this.flagPoleGroup) {
      const poleFlex = reduce ? 0 : (speedRatio * 0.09 + Math.sin(phase * 0.7) * 0.012);
      this.flagPoleGroup.rotation.x = 0.15 + poleFlex;
      this.flagPoleGroup.rotation.z = -0.09 - lean * 0.14;
    }
    if (this.flagMesh) {
      const targetYaw = reduce ? -0.62 : (-0.62 + THREE.MathUtils.clamp(lean * 0.55 - windF * 0.0026, -0.34, 0.42));
      this.flagMesh.rotation.y = targetYaw;
    }
    const fPos = this.flagGeo.attributes.position;
    const fBase = this.flagBasePos;
    const flagW = 2.75;
    const ampZ = reduce ? 0 : (0.22 + speedRatio * 0.36);
    const ampY = reduce ? 0 : (0.06 + speedRatio * 0.12);
    const droopMax = reduce ? 0.08 : (1 - THREE.MathUtils.clamp(speedRatio * 1.25, 0, 1)) * 0.48;
    for (let i = 0; i < fPos.count; i++) {
      const bx = fBase[i * 3];
      const by = fBase[i * 3 + 1];
      const bz = fBase[i * 3 + 2];
      const u = THREE.MathUtils.clamp(bx / flagW, 0, 1); // 0 locked to wooden pole, 1 free fly edge
      const v = (by + 0.83) / 1.66;
      const uEnv = Math.pow(u, 0.85);
      // Multi-harmonic wind wave traveling cleanly from pole toward free tail
      const waveZ = Math.sin(phase * 1.55 - u * 7.1 + v * 0.85) * ampZ * uEnv
        + Math.sin(phase * 3.2 - u * 13.6 - v * 1.2) * (ampZ * 0.36) * u * u;
      // Gentle gravity droop when stationary, lifting taut as bike accelerates
      const droopY = -droopMax * u * u;
      const waveY = Math.cos(phase * 1.9 - u * 7.2) * ampY * u;
      // Natural cloth length foreshortening under billow/droop
      const pullX = -(0.09 * ampZ * ampZ + droopMax * 0.24) * u * u;
      fPos.setXYZ(i, bx + pullX, by + droopY + waveY, bz + waveZ);
    }
    fPos.needsUpdate = true;
    this.flagGeo.computeVertexNormals();

    // 5. Sync Traffic Vehicles Pool
    const vIdx = { car: 0, bus: 0, truck: 0, bike: 0 };
    const blinkPhase = Math.floor(now / 140) % 2 === 0;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!v.active && mode !== 'menu' && v.y - py > 1350) continue;
      const z = -(v.y - py) * SC;
      if (z < -150 || z > 24) continue;

      let kind = 'car';
      if (v.type === 'bus' || v.type === 'fptbus' || v.type === 'tourbus') kind = 'bus';
      else if (v.type === 'truck') kind = 'truck';
      else if (v.type === 'bike' || v.type === 'ship' || v.type === 'ninja' || v.type === 'cyclist') kind = 'bike';

      const pool = this.vehPools[kind];
      if (vIdx[kind] >= pool.length) continue;
      const m = pool[vIdx[kind]++];
      m.visible = true;
      m.position.set(v.x * SC, 0, z);

      if (kind === 'car' || kind === 'truck') {
        vividVehicleColor(v.col, m.userData.bodyMat.color);
      } else if (kind === 'bus') {
        vividVehicleColor(v.col, m.userData.bodyMat.color);
        const lbl = v.type === 'fptbus' ? 'FPT BUS' : v.type === 'tourbus' ? 'DU LỊCH' : 'BUÝT';
        const lBg = v.type === 'fptbus' ? '#f26f21' : v.type === 'tourbus' ? '#0a84b8' : '#2f9e6e';
        const sMat = this._getSignMat(lbl, lBg, v.type === 'fptbus');
        m.userData.labelMesh.material = sMat;
        m.userData.rearSign.material = sMat;
      } else {
        const ud = m.userData;
        vividVehicleColor(v.col, ud.bikeMat.color);
        ud.helmMat.color.set(v.col === '#f2f2f2' ? '#d93d32' : v.type === 'ship' ? '#f26f21' : '#f4f0e4');
        const shirtCol = v.type === 'ninja' ? v.col
          : v.type === 'ship' ? '#ff6a13'
          : v.type === 'cyclist' ? '#d9f236'
          : '#5c8ab8';
        vividVehicleColor(shirtCol, ud.shirtMat.color);
        ud.shipBox.visible = (v.type === 'ship');
        ud.ninjaCape.visible = (v.type === 'ninja');
        const blinkDir = (v.swerveTrig && !v.swerveDone) ? v.fakeBlink : 0;
        ud.blL.visible = blinkDir < 0 && blinkPhase;
        ud.blR.visible = blinkDir > 0 && blinkPhase;
        ud.warnOrb.visible = v.type === 'ninja' && v.swerveTrig && !v.swerveDone && (st.t - v.swerveTrig) > 0.65;
        if (ud.warnOrb.visible) {
          const pulse = 1.9 + Math.sin(now * 0.018) * 0.28;
          ud.warnOrb.scale.set(pulse, pulse, 1);
        }
      }
    }
    for (const k of ['car', 'bus', 'truck', 'bike']) {
      for (let i = vIdx[k]; i < this.vehPools[k].length; i++) this.vehPools[k][i].visible = false;
    }

    // 6. Sync Items & Obstacles Pool
    if (this.boostPadTex && !reduce) {
      this.boostPadTex.offset.y = (this.boostPadTex.offset.y - safeDt * 1.45) % 1;
    }
    const iIdx = { coffee: 0, banh: 0, barrier: 0, cart: 0, flood: 0, water: 0, hole: 0, boostpad: 0 };
    const beaconOn = Math.floor(now / 260) % 2 === 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.used && it.type !== 'hole' && it.type !== 'water' && it.type !== 'flood' && it.type !== 'boostpad') continue;
      const z = -(it.y - py) * SC;
      if (z < -150 || z > 22) continue;
      const pool = this.itemPools[it.type];
      if (!pool || iIdx[it.type] >= pool.length) continue;
      const m = pool[iIdx[it.type]++];
      m.visible = true;
      m.position.set(it.x * SC, m.position.y, z);

      if (it.type === 'coffee' || it.type === 'banh') {
        m.position.y = 0;
        const bob = reduce ? 0 : Math.sin(now * 0.005 + i) * 0.28;
        m.userData.spin.position.y = 1.9 + bob;
        m.userData.spin.rotation.y = now * 0.0032 + i;
        const rPulse = reduce ? 1 : 1 + Math.sin(now * 0.006 + i) * 0.08;
        m.userData.ring.scale.setScalar(rPulse);
        if (it.type === 'banh') {
          m.userData.banh.visible = (campus !== 3);
          m.userData.coco.visible = (campus === 3);
        }
      } else if (it.type === 'barrier') {
        m.position.y = 0;
        m.scale.x = (it.w * SC) / 8.6;
        m.userData.beaconL.material = beaconOn ? this.mats.blinkOn : this.mats.blinkOff;
        m.userData.beaconR.material = beaconOn ? this.mats.blinkOn : this.mats.blinkOff;
      } else if (it.type === 'cart') {
        m.position.y = 0;
      } else if (it.type === 'flood' || it.type === 'water') {
        m.scale.set((it.w * SC) / 1.9, (it.h * SC) / 1.9, 1);
      } else if (it.type === 'hole') {
        const sH = (it.r * SC) / 1.65;
        m.scale.set(sH, sH * 0.85, 1);
      } else if (it.type === 'boostpad') {
        m.material.opacity = it.used ? 0.32 : 0.92;
      }
    }
    for (const k in iIdx) {
      for (let i = iIdx[k]; i < this.itemPools[k].length; i++) this.itemPools[k][i].visible = false;
    }

    // 7. Sync Intersections, 3D Traffic Lights & Live LED Countdown Displays
    let lCount = 0;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const z = -(l.y - py) * SC;
      if (z < -155 || z > 24 || lCount >= this.lightPool.length) continue;
      const gL = this.lightPool[lCount++];
      gL.visible = true;
      gL.position.set(0, 0, z);
      const lsObj = lightState(l, st.t);
      const ls = lsObj.s;
      const sec = Math.max(0, Math.min(99, Math.ceil(lsObj.left)));
      const ud = gL.userData;
      ud.stopMat.color.setHex(ls === 'r' ? 0xff3b30 : 0xf4f0e4);
      ud.stopGlow.visible = (ls === 'r');
      ud.redMat.color.setHex(ls === 'r' ? 0xff382e : 0x351616);
      ud.yelMat.color.setHex(ls === 'y' ? 0xffc624 : 0x352d14);
      ud.grnMat.color.setHex(ls === 'g' ? 0x38f262 : 0x15351e);

      const ledKey = ls + '_' + sec;
      if (ud.lastLedKey !== ledKey) {
        ud.lastLedKey = ledKey;
        const ledMat = this._getLedCountdownMat(ls, sec);
        for (let si = 0; si < ud.ledScreens.length; si++) {
          ud.ledScreens[si].material = ledMat;
        }
      }

      const showCross = (ls === 'r');
      ud.crossCar1.visible = showCross;
      ud.crossCar2.visible = showCross;
      if (showCross) {
        const span = 76;
        const p1 = ((st.t * 20) % span) - span / 2;
        const p2 = (((st.t * 20) + span * 0.5) % span) - span / 2;
        ud.crossCar1.position.x = -p1;
        ud.crossCar2.position.x = p2;
      }
    }
    for (let i = lCount; i < this.lightPool.length; i++) this.lightPool[i].visible = false;

    // 8. Sync 3D Finish Gate (Contest mode)
    const showGate = !(play === 'solo' && mode !== 'menu');
    const gateZ = -(route - py) * SC;
    if (showGate && gateZ > -170 && gateZ < 28) {
      this.finishGate.visible = true;
      this.finishGate.position.set(0, 0, gateZ);
      if (this.finishGateMapId !== campus) {
        this.finishGateMapId = campus;
        if (this.finishSignMat.map) this.finishSignMat.map.dispose();
        const gateCol = (this.brand && this.brand.accentColor) || '#f26f21';
        this.finishSignMat.map = makeSignTexture('CỔNG ' + mapName, gateCol, '#ffffff', true, this.maxAniso);
        this.finishSignMat.needsUpdate = true;
      }
    } else {
      this.finishGate.visible = false;
    }

    // 9. Weather 3D Rain & Wind Lines + Instanced Particles
    this.rainLines.visible = !!(st.inRain && !reduce);
    if (this.rainLines.visible) {
      this.rainLines.position.y = -((now * 0.045) % 8);
      this.rainLines.position.x = Math.sin(now * 0.002) * 1.5;
    }
    this.windLines.visible = !!(st.windForce && !reduce);
    if (this.windLines.visible) {
      const wDir = Math.sign(st.windForce);
      this.windLines.position.x = (((now * 0.055 * wDir) % 24) + 24) % 24 - 12;
    }

    const pLen = Math.min(64, parts ? parts.length : 0);
    this.partMesh.count = pLen;
    for (let i = 0; i < pLen; i++) {
      const pt = parts[i];
      const lifeR = THREE.MathUtils.clamp(pt.life / pt.max, 0.05, 1);
      this.partDummy.position.set(pt.x * SC, 0.8 + (1 - lifeR) * 1.6, -(pt.y - py) * SC);
      this.partDummy.scale.setScalar((pt.r || 3) * 0.32 * lifeR);
      this.partDummy.updateMatrix();
      this.partMesh.setMatrixAt(i, this.partDummy.matrix);
      this.partCol.set(pt.c || '#ffffff');
      this.partMesh.setColorAt(i, this.partCol);
    }
    if (pLen > 0) {
      this.partMesh.instanceMatrix.needsUpdate = true;
      if (this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true;
    }

    // 11. Render Frame!
    this.renderer.render(this.scene, this.camera);
  }
}

const mgr = new Scene3DManager();
window.SCENE3D = mgr;
window.dispatchEvent(new CustomEvent('scene3d:ready', { detail: mgr }));
