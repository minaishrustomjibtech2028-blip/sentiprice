/**
 * Generated placeholder art for products with no uploaded image.
 *
 * Each category gets a deterministic gradient + icon, rendered as an inline
 * SVG data URI (no network request, no external image service). Once an
 * admin uploads a real photo, mediaUrl() takes over and this is never used
 * for that product again.
 */
const PALETTES: Record<string, [string, string]> = {
  "Electronics": ["#0ea5e9", "#0369a1"],
  "Fashion & Apparel": ["#ec4899", "#9d174d"],
  "Beauty & Makeup": ["#f472b6", "#be185d"],
  "Home & Kitchen": ["#f59e0b", "#b45309"],
  "Groceries & Gourmet": ["#84cc16", "#3f6212"],
  "Sports & Fitness": ["#ef4444", "#991b1b"],
  "Books & Stationery": ["#8b5cf6", "#5b21b6"],
  "Toys & Games": ["#f97316", "#9a3412"],
  "Furniture": ["#a16207", "#713f12"],
  "Automotive": ["#334155", "#0f172a"],
  "Mobile Accessories": ["#06b6d4", "#155e75"],
  "Health & Wellness": ["#10b981", "#065f46"],
  "Jewelry & Watches": ["#eab308", "#854d0e"],
  "Pet Supplies": ["#d97706", "#78350f"],
  "Baby & Kids": ["#fb7185", "#9f1239"],
  "Office Supplies": ["#64748b", "#334155"],
  "Garden & Outdoor": ["#22c55e", "#166534"],
  "Musical Instruments": ["#a855f7", "#6b21a8"],
  "Luggage & Travel Gear": ["#0d9488", "#115e59"],
  "Video Games & Consoles": ["#6366f1", "#3730a3"],
};
const FALLBACK: [string, string] = ["#64748b", "#334155"];

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Returns a data: URI SVG — safe to drop straight into an <img src>. */
export function placeholderImage(name: string, category: string): string {
  const [c1, c2] = PALETTES[category] ?? FALLBACK;
  const hue = hashHue(name);
  const label = initials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#g)"/>
    <circle cx="200" cy="170" r="90" fill="hsla(${hue},70%,85%,0.18)"/>
    <circle cx="320" cy="300" r="60" fill="hsla(${hue},70%,85%,0.12)"/>
    <text x="200" y="195" text-anchor="middle" font-family="Arial, sans-serif" font-size="92" font-weight="700" fill="#ffffff" opacity="0.92">${label}</text>
    <text x="200" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="#ffffff" opacity="0.85">${category}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
