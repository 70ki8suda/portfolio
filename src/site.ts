export const siteName = '70ki8suda';
export const siteTitle = '70ki8suda — Where spirit meets technology';
export const siteDescription = 'Where spirit meets technology. Imagining a sustainable world where spirituality and technology coexist. Rooted in nature. Connected with care. Free to slow down. Art and selected work by 70ki8suda.';
export const githubProfile = 'https://github.com/70ki8suda';

/** `<title>` for inner pages, e.g. `Blog — 70ki8suda`. */
export const pageTitle = (title: string) => `${title} — ${siteName}`;

/** Shared social preview captured from the homepage at 1200 × 630. */
export const socialImageMeta = [
  { property: 'og:image', content: 'https://70ki8suda.com/og/first-visual.jpg' },
  { property: 'og:image:type', content: 'image/jpeg' },
  { property: 'og:image:width', content: '1200' },
  { property: 'og:image:height', content: '630' },
  { property: 'og:image:alt', content: '70ki8suda — 稲と水路を備えた多段式の水耕栽培ユニット' },
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:image', content: 'https://70ki8suda.com/og/first-visual.jpg' },
  { name: 'twitter:image:alt', content: '70ki8suda — 稲と水路を備えた多段式の水耕栽培ユニット' },
];
