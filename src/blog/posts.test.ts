import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectPosts, parsePost, PostValidationError } from './parsePost';
import { collectTags, filterByTag, seriesPosts, toSummary, youTubeEmbedUrl, youTubeWatchUrl, type PostSummary } from './posts';

const post = (frontmatter: string, body = '\nHello.\n') => `---\n${frontmatter}\n---${body}`;
const valid = 'title: A post\ndate: 2026-09-20\ndescription: Short summary.\ntags: [design, notes]';

describe('parsePost', () => {
  it('reads validated frontmatter, derives the slug from the file name, and keeps the body', () => {
    expect(parsePost('/content/posts/a-post.md', post(valid, '\n## Heading\n\nText.\n'))).toEqual({
      slug: 'a-post',
      title: 'A post',
      date: '2026-09-20',
      description: 'Short summary.',
      tags: ['design', 'notes'],
      draft: false,
      lang: 'ja',
      body: '## Heading\n\nText.\n',
    });
  });

  it('keeps ordinary posts free of video and series metadata', () => {
    const parsed = parsePost('plain.md', post(valid));
    expect(parsed).not.toHaveProperty('video');
    expect(parsed).not.toHaveProperty('series');
  });

  it('accepts an explicit English language', () => {
    expect(parsePost('english.md', post(`${valid}\nlang: en`)).lang).toBe('en');
  });

  it('accepts an explicit draft flag and CRLF line endings', () => {
    const source = post(`${valid}\ndraft: true`).replace(/\n/g, '\r\n');
    expect(parsePost('draft-post.md', source)).toMatchObject({ slug: 'draft-post', draft: true });
  });

  it.each([
    ['missing frontmatter', 'No frontmatter here.', /missing frontmatter/],
    ['missing title', post('date: 2026-09-20\ndescription: d\ntags: []'), /`title`/],
    ['empty description', post('title: t\ndate: 2026-09-20\ndescription: "  "\ntags: []'), /`description`/],
    ['impossible date', post('title: t\ndate: 2026-02-30\ndescription: d\ntags: []'), /`date`/],
    ['non-ISO date', post('title: t\ndate: 20 Sep 2026\ndescription: d\ntags: []'), /`date`/],
    ['tags not a list', post('title: t\ndate: 2026-09-20\ndescription: d\ntags: design'), /`tags`/],
    ['duplicate tags', post('title: t\ndate: 2026-09-20\ndescription: d\ntags: [a, a]'), /duplicates/],
    ['non-boolean draft', post(`${valid}\ndraft: "yes"`), /`draft`/],
    ['misspelled field', post(`${valid}\ndrafts: true`), /unknown frontmatter field\(s\): drafts/],
    ['unsupported language', post(`${valid}\nlang: fr`), /`lang`/],
    ['invalid YAML', post('title: [unclosed'), /invalid YAML/],
  ])('rejects %s', (_name, source, message) => {
    expect(() => parsePost('content/posts/bad.md', source)).toThrow(PostValidationError);
    expect(() => parsePost('content/posts/bad.md', source)).toThrow(message);
  });

  it('names the offending file in validation errors', () => {
    expect(() => parsePost('content/posts/broken.md', post('title: t'))).toThrow(/^content\/posts\/broken\.md: /);
  });

  it.each(['Upper-Case.md', 'two--hyphens.md', 'under_score.md', '-leading.md'])('rejects the unsafe slug in %s', (file) => {
    expect(() => parsePost(file, post(valid))).toThrow(/file name/);
  });
});

describe('video metadata', () => {
  const video = `${valid}\nyoutubeId: "bReS9FLpgT4"\nsourceTitle: "Understand the Economy Part 1: What is wealth?"\nsourcePublishedAt: 2024-01-15`;

  it('reads the YouTube ID, source title, and release date', () => {
    expect(parsePost('video.md', post(video)).video).toEqual({
      youtubeId: 'bReS9FLpgT4',
      title: 'Understand the Economy Part 1: What is wealth?',
      publishedAt: '2024-01-15',
    });
  });

  it('treats the release date as optional', () => {
    expect(parsePost('video.md', post(`${valid}\nyoutubeId: a-ohZ74hdeI\nsourceTitle: How To Get Rich`)).video).toEqual({ youtubeId: 'a-ohZ74hdeI', title: 'How To Get Rich' });
  });

  it.each([
    ['too short', '"bReS9FLpgT"'],
    ['too long', '"bReS9FLpgT44"'],
    ['a full URL', '"https://youtu.be/bReS9FLpgT4"'],
    ['a query-string injection', '"bReS9FLp?a=1"'],
    ['a path traversal', '"../../x/abcd"'],
    ['whitespace padding', '" bReS9FLpgT4"'],
    ['an unquoted number', '12345678901'],
  ])('rejects a malformed youtubeId: %s', (_name, id) => {
    expect(() => parsePost('video.md', post(`${valid}\nyoutubeId: ${id}\nsourceTitle: T`))).toThrow(/`youtubeId`/);
  });

  it('requires a source title with a video', () => {
    expect(() => parsePost('video.md', post(`${valid}\nyoutubeId: bReS9FLpgT4`))).toThrow(/`sourceTitle`/);
  });

  it('rejects source fields without a video', () => {
    expect(() => parsePost('video.md', post(`${valid}\nsourceTitle: T`))).toThrow(/require `youtubeId`/);
    expect(() => parsePost('video.md', post(`${valid}\nsourcePublishedAt: 2024-01-01`))).toThrow(/require `youtubeId`/);
  });

  it('rejects an impossible source release date', () => {
    expect(() => parsePost('video.md', post(`${valid}\nyoutubeId: bReS9FLpgT4\nsourceTitle: T\nsourcePublishedAt: 2024-13-01`))).toThrow(/`sourcePublishedAt`/);
  });
});

describe('series metadata', () => {
  it('reads the series name and position', () => {
    expect(parsePost('part.md', post(`${valid}\nseries: Understand the Economy\nseriesOrder: 2`)).series).toEqual({ name: 'Understand the Economy', order: 2 });
  });

  it.each([
    ['series without order', 'series: S'],
    ['order without series', 'seriesOrder: 1'],
  ])('rejects %s', (_name, extra) => {
    expect(() => parsePost('part.md', post(`${valid}\n${extra}`))).toThrow(/set together/);
  });

  it.each(['0', '-1', '1.5', '"2"'])('rejects seriesOrder %s', (order) => {
    expect(() => parsePost('part.md', post(`${valid}\nseries: S\nseriesOrder: ${order}`))).toThrow(/`seriesOrder`/);
  });

  it('rejects two posts claiming the same place in a series, even if one is a draft', () => {
    const files = {
      'content/posts/one.md': post(`${valid}\nseries: S\nseriesOrder: 1`),
      'content/posts/two.md': post(`${valid}\nseries: S\nseriesOrder: 1\ndraft: true`),
    };
    expect(() => collectPosts(files, { includeDrafts: false })).toThrow(/already used by content\/posts\/one\.md/);
  });

  it('lists a post’s series siblings in order and ignores other series', () => {
    const make = (slug: string, series?: { name: string; order: number }): PostSummary => ({ slug, title: slug, date: '2026-01-01', description: 'd', tags: [], draft: false, lang: 'ja', series });
    const posts = [make('p3', { name: 'S', order: 3 }), make('other', { name: 'T', order: 1 }), make('p1', { name: 'S', order: 1 }), make('plain')];
    expect(seriesPosts(posts, posts[0]).map((p) => p.slug)).toEqual(['p1', 'p3']);
    expect(seriesPosts(posts, posts[3])).toEqual([]);
  });
});

describe('YouTube URLs', () => {
  it('builds privacy-enhanced embed and watch URLs from a valid ID', () => {
    expect(youTubeEmbedUrl('-k6czLUdJPI')).toBe('https://www.youtube-nocookie.com/embed/-k6czLUdJPI');
    expect(youTubeWatchUrl('rAb_p5DCC3E')).toBe('https://www.youtube.com/watch?v=rAb_p5DCC3E');
  });

  it.each(['', 'short', 'bReS9FLpgT4?autoplay=1', 'bReS9FLpgT4/../x', '"><script>'])('refuses to build a URL from %j', (id) => {
    expect(() => youTubeEmbedUrl(id)).toThrow(/Invalid YouTube video ID/);
    expect(() => youTubeWatchUrl(id)).toThrow(/Invalid YouTube video ID/);
  });
});

describe('collectPosts', () => {
  const files = {
    'content/posts/older.md': post(valid.replace('2026-09-20', '2026-01-02')),
    'content/posts/newer.md': post(valid.replace('2026-09-20', '2026-03-04')),
    'content/posts/b-same-day.md': post(valid.replace('2026-09-20', '2026-02-01')),
    'content/posts/a-same-day.md': post(valid.replace('2026-09-20', '2026-02-01')),
    'content/posts/secret.md': post(`${valid}\ndraft: true`),
  };

  it('hides drafts and orders posts newest first, breaking ties by slug', () => {
    expect(collectPosts(files, { includeDrafts: false }).map((p) => p.slug)).toEqual(['newer', 'a-same-day', 'b-same-day', 'older']);
  });

  it('includes drafts only when asked', () => {
    expect(collectPosts(files, { includeDrafts: true }).map((p) => p.slug)).toContain('secret');
  });

  it('fails loudly if any file is invalid instead of silently dropping it', () => {
    expect(() => collectPosts({ ...files, 'content/posts/bad.md': 'nope' }, { includeDrafts: false })).toThrow(/bad\.md/);
  });
});

describe('tags', () => {
  const summaries: PostSummary[] = [
    { slug: 'a', title: 'A', date: '2026-01-01', description: 'd', tags: ['notes', 'design'], draft: false, lang: 'en' },
    { slug: 'b', title: 'B', date: '2026-01-02', description: 'd', tags: ['design'], draft: false, lang: 'en' },
    { slug: 'c', title: 'C', date: '2026-01-03', description: 'd', tags: ['code'], draft: false, lang: 'en' },
  ];

  it('lists tags by frequency then name', () => {
    expect(collectTags(summaries)).toEqual(['design', 'code', 'notes']);
  });

  it('filters by exact tag and returns everything without a tag', () => {
    expect(filterByTag(summaries, 'design').map((p) => p.slug)).toEqual(['a', 'b']);
    expect(filterByTag(summaries, 'unknown')).toEqual([]);
    expect(filterByTag(summaries, undefined)).toHaveLength(3);
  });

  it('strips the body from summaries', () => {
    expect(toSummary({ ...summaries[0], body: 'secret' })).not.toHaveProperty('body');
  });
});

describe('repository content', () => {
  const read = (relative: string) => {
    const directory = join(import.meta.dirname, '../..', relative);
    return Object.fromEntries(
      readdirSync(directory).filter((name) => name.endsWith('.md')).map((name) => [`${relative}/${name}`, readFileSync(join(directory, name), 'utf8')]),
    );
  };
  const files = read('content/posts');

  it('every committed post has valid frontmatter', () => {
    expect(Object.keys(files).length).toBeGreaterThan(0);
    expect(() => collectPosts(files, { includeDrafts: true })).not.toThrow();
  });

  it('keeps the removed sample posts and placeholder tags out, and the course series intact', () => {
    const all = collectPosts(files, { includeDrafts: true });
    for (const slug of ['sample-markdown-field-guide', 'sample-writing-slowly', 'sample-unpublished-draft']) {
      expect(files).not.toHaveProperty([`content/posts/${slug}.md`]);
    }
    const garys = all.filter((entry) => entry.slug.startsWith('garys-'));
    expect(collectTags(garys).filter((tag) => ['コース', 'sample', 'markdown', 'notes', 'reference'].includes(tag))).toEqual([]);
    const course = all.find((entry) => entry.slug === 'garys-understand-economy-1-what-is-wealth')!;
    expect(seriesPosts(all, course).map((entry) => entry.slug)).toEqual([
      'garys-understand-economy-1-what-is-wealth',
      'garys-understand-economy-2-wealth-inequality',
      'garys-understand-economy-3-why-inequality-ignored',
      'garys-understand-economy-4-inequality-driving-everything',
    ]);
  });

  it('every test fixture post has valid frontmatter', () => {
    expect(() => collectPosts(read('tests/fixtures/posts'), { includeDrafts: true })).not.toThrow();
  });
});
