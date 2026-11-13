import editorial from '../../content/graph-editorial.json';
import { collectPosts } from './parsePost';
import type { Post } from './posts';

// Bundled into the server build only. Import protection fails the build if this
// module ever reaches the client, so draft text cannot ship to browsers.
const posts = import.meta.glob<string>('/content/posts/*.md', { eager: true, query: '?raw', import: 'default' });

// Playwright starts the dev server with BLOG_FIXTURES=1 to add test-only posts
// (Markdown features, a draft, video series, Japanese text). Dead code in production builds.
const fixtures = import.meta.env.DEV && process.env.BLOG_FIXTURES === '1'
  ? import.meta.glob<string>('/tests/fixtures/posts/*.md', { eager: true, query: '?raw', import: 'default' })
  : {};
const files = { ...posts, ...fixtures };

/**
 * Drafts are always hidden, except in the local dev server when explicitly
 * requested with `BLOG_DRAFTS=1 npm run dev`. Production builds ignore the flag.
 */
const includeDrafts = import.meta.env.DEV && process.env.BLOG_DRAFTS === '1';

let visible: Post[] | undefined;

/** Visible posts, newest first. Invalid frontmatter throws with the offending file name. */
export function getVisiblePosts() {
  visible ??= collectPosts(files, { includeDrafts }).map(post => ({ ...post,
    ...((editorial.articles as Record<string, { category: string }>)[post.slug]?.category === 'current-affairs'
      ? { listGroup: 'current-economy' as const } : {}),
  }));
  return visible;
}

export function findVisiblePost(slug: string) {
  return getVisiblePosts().find((post) => post.slug === slug);
}
