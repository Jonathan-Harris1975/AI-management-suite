

const tones = [
  'Sarcastic',
  'Witty',
  'Dry as hell',
  'Skeptical',
  'Optimistic',
  'Casual',
  'Playful',
   'Bold',
  'Cautious',
  'Confident',
  'Inspirational',
  'Friendly',
  'Humorous'
];

export function getRandomTone() {
  const idx = Math.floor(Math.random() * tones.length);
  return tones[idx];
}
