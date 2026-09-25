import { parse as parseYaml } from 'yaml';
import { isPostSlug, isYouTubeId, POST_LANGS, type Post, type PostLang, type PostSeries, type PostVideo } from './posts';

export class PostValidationError extends Error {
  constructor(file: string, problem: string) {
    super(`${file}: ${problem}`);
    this.name = 'PostValidationError';
  }
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEYS = new Set(['title', 'date', 'description', 'tags', 'draft', 'lang', 'youtubeId', 'sourceTitle', 'sourcePublishedAt', 'series', 'seriesOrder']);

/** `content/posts/hello-world.md` → `hello-world` */
export function slugFromPath(path: string) {
  const name = path.split('/').pop() ?? '';
  return name.replace(/\.md$/, '');
}

function isCalendarDate(value: string) {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function requireText(file: string, data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PostValidationError(file, `\`${key}\` must be a non-empty string`);
  }
  return value.trim();
}

function readVideo(file: string, fields: Record<string, unknown>): { video?: PostVideo } {
  const { youtubeId, sourceTitle, sourcePublishedAt } = fields;
  if (youtubeId === undefined) {
    if (sourceTitle !== undefined || sourcePublishedAt !== undefined) {
      throw new PostValidationError(file, '`sourceTitle` and `sourcePublishedAt` describe a video and require `youtubeId`');
    }
    return {};
  }
  // Quote IDs in YAML: an unquoted ID such as 12345678901 would otherwise parse as a number.
  if (typeof youtubeId !== 'string' || !isYouTubeId(youtubeId)) {
    throw new PostValidationError(file, '`youtubeId` must be the 11-character YouTube video ID (letters, digits, `-`, `_`), e.g. "dQw4w9WgXcQ"');
  }
  const video: PostVideo = { youtubeId, title: requireText(file, fields, 'sourceTitle') };
  if (sourcePublishedAt !== undefined) {
    if (typeof sourcePublishedAt !== 'string' || !isCalendarDate(sourcePublishedAt)) {
      throw new PostValidationError(file, '`sourcePublishedAt` must be a real calendar date written as YYYY-MM-DD');
    }
    video.publishedAt = sourcePublishedAt;
  }
  return { video };
}

function readSeries(file: string, fields: Record<string, unknown>): { series?: PostSeries } {
  const { series, seriesOrder } = fields;
  if (series === undefined && seriesOrder === undefined) return {};
  if (series === undefined || seriesOrder === undefined) {
    throw new PostValidationError(file, '`series` and `seriesOrder` must be set together');
  }
  const name = requireText(file, fields, 'series');
  if (typeof seriesOrder !== 'number' || !Number.isInteger(seriesOrder) || seriesOrder < 1) {
    throw new PostValidationError(file, '`seriesOrder` must be a positive whole number (1, 2, 3, …)');
  }
  return { series: { name, order: seriesOrder } };
}

/** Parses one Markdown file and validates its frontmatter. Throws with the file name on any problem. */
export function parsePost(file: string, source: string): Post {
  const slug = slugFromPath(file);
  if (!isPostSlug(slug)) {
    throw new PostValidationError(file, 'file name must be lowercase letters, digits, and single hyphens (e.g. `my-first-post.md`)');
  }

  const match = FRONTMATTER.exec(source.replace(/^\uFEFF/, ''));
  if (!match) throw new PostValidationError(file, 'missing frontmatter block delimited by `---` lines');

  let data: unknown;
  try {
    data = parseYaml(match[1]);
  } catch (error) {
    throw new PostValidationError(file, `invalid YAML frontmatter (${(error as Error).message})`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new PostValidationError(file, 'frontmatter must be a key/value mapping');
  }
  const fields = data as Record<string, unknown>;

  const unknown = Object.keys(fields).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) {
    throw new PostValidationError(file, `unknown frontmatter field(s): ${unknown.join(', ')}`);
  }

  const title = requireText(file, fields, 'title');
  const description = requireText(file, fields, 'description');

  const date = fields.date;
  if (typeof date !== 'string' || !isCalendarDate(date)) {
    throw new PostValidationError(file, '`date` must be a real calendar date written as YYYY-MM-DD');
  }

  const tags = fields.tags;
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string' || tag.trim() === '')) {
    throw new PostValidationError(file, '`tags` must be a list of non-empty strings');
  }
  const normalizedTags = tags.map((tag: string) => tag.trim());
  if (new Set(normalizedTags).size !== normalizedTags.length) {
    throw new PostValidationError(file, '`tags` must not contain duplicates');
  }

  const draft = fields.draft ?? false;
  if (typeof draft !== 'boolean') {
    throw new PostValidationError(file, '`draft` must be true or false when present');
  }

  const lang = fields.lang ?? 'ja';
  if (!POST_LANGS.includes(lang as PostLang)) {
    throw new PostValidationError(file, `\`lang\` must be one of: ${POST_LANGS.join(', ')}`);
  }

  return {
    slug,
    title,
    date,
    description,
    tags: normalizedTags,
    draft,
    lang: lang as PostLang,
    ...readVideo(file, fields),
    ...readSeries(file, fields),
    body: source.replace(/^\uFEFF/, '').slice(match[0].length),
  };
}

export interface CollectOptions {
  includeDrafts: boolean;
}

/**
 * Parses every file, checks rules that span posts, drops drafts unless requested,
 * and sorts newest first (slug breaks ties).
 */
export function collectPosts(files: Record<string, string>, { includeDrafts }: CollectOptions): Post[] {
  const posts = Object.entries(files).map(([file, source]) => ({ file, post: parsePost(file, source) }));

  // Checked across drafts too, so publishing a draft can never create a clash.
  const seriesSlots = new Map<string, string>();
  for (const { file, post } of posts) {
    if (!post.series) continue;
    const slot = `${post.series.name}\u0000${post.series.order}`;
    const taken = seriesSlots.get(slot);
    if (taken) {
      throw new PostValidationError(file, `\`seriesOrder\` ${post.series.order} in series "${post.series.name}" is already used by ${taken}`);
    }
    seriesSlots.set(slot, file);
  }

  return posts
    .map(({ post }) => post)
    .filter((post) => includeDrafts || !post.draft)
    .sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)));
}
