import { lazy, Suspense } from 'react';
import * as stylex from '@stylexjs/stylex';
import { createFileRoute, Link } from '@tanstack/react-router';
import { fetchPostSummaries } from '../../blog/api';
import { collectTags, filterByTag, formatPostDate } from '../../blog/posts';
import { blog } from '../../styles/blog.stylex';
import { shared } from '../../styles/shared.stylex';
import type { GraphSearch } from '../../blog/ParagraphGraph';
import { graph } from '../../styles/graph.stylex';
import { pageTitle } from '../../site';

const ParagraphGraph = lazy(() => import('../../blog/ParagraphGraph'));

interface BlogSearch extends GraphSearch {
  view?: 'graph';
  tag?: string;
}

const description = 'Notes by 70ki8suda on technology, economics, and the systems that shape our lives.';

export const Route = createFileRoute('/blog/')({
  validateSearch: (search: Record<string, unknown>): BlogSearch => {
    const tag = typeof search.tag === 'string' ? search.tag.trim() : '';
    const result: BlogSearch = tag ? { tag } : {};
    if (search.view === 'graph') {
      result.view = 'graph';
      for (const key of ['article', 'concept', 'q', 'node'] as const) {
        if (typeof search[key] === 'string' && search[key]) result[key] = search[key].slice(0, 500);
      }
    }
    return result;
  },
  loader: () => fetchPostSummaries(),
  head: ({ match }) => {
    const title = match.search.view === 'graph' ? pageTitle('テーマの地図 — Blog')
      : match.search.tag ? pageTitle(`Posts tagged “${match.search.tag}” — Blog`) : pageTitle('Blog');
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
      ],
    };
  },
  component: BlogIndex,
});

function BlogIndex() {
  const posts = Route.useLoaderData();
  const search = Route.useSearch();
  const { tag, view } = search;
  const navigate = Route.useNavigate();
  const tags = collectTags(posts);
  const visible = filterByTag(posts, tag);

  if (view === 'graph') return <Suspense fallback={<p role="status" lang="ja" {...stylex.props(graph.status)}>地図を準備しています…</p>}>
    <ParagraphGraph search={search} onChange={next => { void navigate({ search: { view: 'graph', ...(tag ? { tag } : {}), ...next }, replace: next.article === search.article && next.node === search.node, resetScroll: false }); }} />
  </Suspense>;

  return (
    <div {...stylex.props(blog.grid)}>
      <p {...stylex.props(shared.label, blog.sideLabel)}><span {...stylex.props(shared.amber)}>04</span> / Blog</p>
      <div>
        <nav aria-label="ブログの表示" lang="ja" {...stylex.props(graph.viewSwitch)}>
          <Link to="/blog" search={tag ? { tag } : {}} aria-current={!view ? 'page' : undefined} {...stylex.props(graph.button, !view && graph.buttonActive)}>一覧</Link>
          <Link to="/blog" search={{ view: 'graph', ...(tag ? { tag } : {}) }} aria-current={view === 'graph' ? 'page' : undefined} {...stylex.props(graph.button, view === 'graph' && graph.buttonActive)}>地図</Link>
        </nav>
        {tags.length > 0 && (
          <nav aria-label="Filter posts by tag" {...stylex.props(blog.filters)}>
            <span {...stylex.props(shared.label, blog.filtersLabel)}>Tags</span>
            <Link to="/blog" activeOptions={{ exact: true }} {...stylex.props(shared.label, blog.filter, !tag && blog.filterActive)}>All</Link>
            {tags.map((name) => (
              <Link key={name} to="/blog" search={{ tag: name }} activeOptions={{ exact: true }} {...stylex.props(shared.label, blog.filter, tag === name && blog.filterActive)}>
                {name}
              </Link>
            ))}
          </nav>
        )}

        <p {...stylex.props(shared.label, blog.listMeta)} aria-live="polite">
          <span>{tag ? `Tagged “${tag}”` : 'All posts'}</span>
          <span>{visible.length} {visible.length === 1 ? 'post' : 'posts'}</span>
        </p>

        {visible.length > 0 ? (
          <ul {...stylex.props(blog.list)}>
            {visible.map((post) => (
              <li key={post.slug} {...stylex.props(blog.item)}>
                <p {...stylex.props(shared.label, blog.itemDate)}>
                  <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                  {post.draft && <span {...stylex.props(blog.draftBadge)}>Draft</span>}
                </p>
                <article lang={post.lang} aria-labelledby={`post-${post.slug}`}>
                  <h2 id={`post-${post.slug}`} {...stylex.props(blog.itemTitle)}>
                    <Link to="/blog/$slug" params={{ slug: post.slug }} {...stylex.props(blog.itemLink)}>{post.title}</Link>
                  </h2>
                  <p {...stylex.props(blog.itemDescription)}>{post.description}</p>
                  {post.tags.length > 0 && (
                    <ul aria-label="Tags" {...stylex.props(blog.tags)}>
                      {post.tags.map((name) => (
                        <li key={name}><Link to="/blog" search={{ tag: name }} {...stylex.props(blog.tagLink)}>#{name}</Link></li>
                      ))}
                    </ul>
                  )}
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <div {...stylex.props(blog.list)}>
            <p {...stylex.props(blog.empty)}>
              {tag ? `No posts are tagged “${tag}”. ` : 'No posts yet. '}
              {tag && <Link to="/blog" {...stylex.props(shared.textLink)}>Show all posts <span aria-hidden="true">→</span></Link>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
