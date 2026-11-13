import legacyTags from './legacyTags.json';
export type PostLang = 'ja' | 'en';
export const POST_LANGS: readonly PostLang[] = ['ja', 'en'];

/** The YouTube video a post explains (`youtubeId`, `sourceTitle`, `sourcePublishedAt`). */
export interface PostVideo {
  youtubeId: string;
  title: string;
  /** `YYYY-MM-DD`, when known. */
  publishedAt?: string;
}

/** Position within an ordered series (`series`, `seriesOrder`). */
export interface PostSeries {
  name: string;
  order: number;
}

export interface PostSummary {
  slug: string;
  title: string;
  /** Calendar date as written in frontmatter, `YYYY-MM-DD`. */
  date: string;
  /** Recorded content revision date; not inferred from publication or a build. */
  updatedAt?: string;
  description: string;
  /** Keep the description in metadata and listings, but omit the article lead. */
  hideDescription?: boolean;
  tags: string[];
  /** Listing category from the editorial manifest, independent of graph opt-in. */
  listGroup?: 'current-economy';
  draft: boolean;
  /** Explicit editorial inclusion in the long-term paragraph map. */
  graph?: boolean;
  /** Language of the post text; sets `lang` on the article. Defaults to `ja`. */
  lang: PostLang;
  video?: PostVideo;
  series?: PostSeries;
}

export interface Post extends PostSummary {
  /** Markdown body without the frontmatter block. */
  body: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slugs are file names: lowercase letters, digits, and single hyphens. */
export const isPostSlug = (value: string) => SLUG.test(value);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export const isYouTubeId = (value: string) => YOUTUBE_ID.test(value);

/** Privacy-enhanced embed URL. Re-validates so an unchecked ID can never reach an iframe `src`. */
export function youTubeEmbedUrl(youtubeId: string) {
  if (!isYouTubeId(youtubeId)) throw new Error(`Invalid YouTube video ID: ${JSON.stringify(youtubeId)}`);
  return `https://www.youtube-nocookie.com/embed/${youtubeId}`;
}

export function youTubeWatchUrl(youtubeId: string) {
  if (!isYouTubeId(youtubeId)) throw new Error(`Invalid YouTube video ID: ${JSON.stringify(youtubeId)}`);
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

export function toSummary({ body: _body, ...summary }: Post): PostSummary {
  return summary;
}

/** Every tag in use, most frequent first, then alphabetical. */
export function collectTags(posts: PostSummary[]) {
  const counts = new Map<string, number>();
  for (const post of posts) for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
    .map(([tag]) => tag);
}

export function filterByTag<T extends PostSummary>(posts: T[], tag: string | undefined) {
  if (!tag) return posts;
  const legacy = Object.hasOwn(legacyTags, tag) ? (legacyTags as Record<string, string[]>)[tag] : undefined;
  return posts.filter(post => post.tags.includes(tag) || legacy?.includes(post.slug));
}

/** `2026-09-24` → `2026.09.24`. Deterministic, so server and client render the same text. */
export const formatPostDate = (date: string) => date.replaceAll('-', '.');

/** Posts in the same series as `post`, in series order. Empty when the post is not part of a series. */
export function seriesPosts<T extends PostSummary>(posts: T[], post: PostSummary): T[] {
  const name = post.series?.name;
  if (!name) return [];
  return posts.filter((candidate) => candidate.series?.name === name).sort((a, b) => a.series!.order - b.series!.order);
}

/** Editorial opt-in never overrides publication visibility. */
export const isGraphPost = (post: PostSummary) => !post.draft && post.graph === true;

export const isLegacyTag = (tag: string | undefined) => !!tag && Object.hasOwn(legacyTags, tag);
export function filterByListGroup<T extends PostSummary>(posts: T[], group?: 'current-economy') {
  return posts.filter(post => group === 'current-economy' ? post.listGroup === group : post.listGroup !== 'current-economy');
}
