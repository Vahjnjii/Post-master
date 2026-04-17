
export const SUPPORTED_LANGUAGES = [
  { name: 'Original', code: 'auto' },
  { name: 'German', code: 'de' },
  { name: 'French', code: 'fr' },
  { name: 'Dutch', code: 'nl' },
  { name: 'Polish', code: 'pl' },
  { name: 'Chinese (Trad)', code: 'zh-TW' },
  { name: 'Finnish', code: 'fi' },
  { name: 'Danish', code: 'da' },
  { name: 'Norwegian', code: 'no' },
  { name: 'Spanish', code: 'es' },
  { name: 'Italian', code: 'it' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Swedish', code: 'sv' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Korean', code: 'ko' }
];

export const POST_EMOJIS = ["✨", "🌟", "🌙", "💫", "🔮", "🧿", "🔥", "💎", "🌈", "🔥", "🛸", "🪐", "⚡", "🍀"];

export const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", 
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

// 3 Distinct Animation Modes for variety
export enum BackgroundMode {
  NEBULA = 'NEBULA',   // Large moving blobs
  STARDUST = 'STARDUST', // Floating particles/moisture
  AURORA = 'AURORA'    // Vertical light streaks
}

export const BACKGROUND_THEMES = [
  // Deep Purple / Magenta
  { bg: '#05020a', blobs: ['#2e0b4d', '#5b1085', '#0f2c6b'] },
  // Midnight Ocean / Teal
  { bg: '#000814', blobs: ['#0a1f40', '#004466', '#002233'] },
  // Cosmic Void / Grey
  { bg: '#0a0a0a', blobs: ['#1f1f1f', '#333333', '#111111'] },
  // Golden Dust / Brown
  { bg: '#0f0a00', blobs: ['#3d2900', '#664d14', '#2e2005'] },
  // Crimson Shadow / Red
  { bg: '#0f0202', blobs: ['#3d0808', '#591010', '#240404'] },
  // Emerald Deep / Green
  { bg: '#010f06', blobs: ['#06331a', '#0a4f29', '#022110'] },
  // Royal Blue
  { bg: '#020214', blobs: ['#0b0b45', '#1a1a6e', '#050529'] },
  // Cyberpunk Pink
  { bg: '#14020b', blobs: ['#4a0a25', '#7a123e', '#290314'] }
];
