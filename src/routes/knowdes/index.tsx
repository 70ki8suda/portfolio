import { canonicalPostUrl } from '../../blog/postPaths';
import { claimPreviewMode } from '../../blog/claimPreview';
import { lazy, Suspense } from 'react';
import * as stylex from '@stylexjs/stylex';
import { createFileRoute, Link } from '@tanstack/react-router';
import { fetchPostSummaries } from '../../blog/api';
import { BLOG_CATEGORIES, type PostListGroup, collectTags, filterByTag, filterByListGroup, isLegacyTag, formatPostDate } from '../../blog/posts';
import { blog } from '../../styles/blog.stylex';
import { shared } from '../../styles/shared.stylex';
import type { GraphSearch } from '../../blog/ParagraphGraph';
import { graph } from '../../styles/graph.stylex';
import { pageTitle } from '../../site';

const heading = stylex.create({formula:{fontSize:13,lineHeight:1.6,marginBottom:16},canvasFormula:{paddingBlock:8,paddingInline:16,marginBottom:0,flexShrink:0}});
const ParagraphGraph = lazy(() => import('../../blog/ParagraphGraph'));

interface BlogSearch extends GraphSearch {
  view?: 'graph';
  tag?: string;
  category?: PostListGroup;
}

const description = 'Notes by 70ki8suda on technology, economics, and the systems that shape our lives.';

export const Route = createFileRoute('/knowdes/')({
  validateSearch: (search: Record<string, unknown>): BlogSearch => {
    const tag = typeof search.tag === 'string' ? search.tag.trim() : '';
    const result: BlogSearch = tag ? { tag } : {};
    if (search.category === 'current-economy' || search.category === 'engineering') result.category = search.category;
    if (search.view === 'graph') {
      result.view = 'graph';
      const preview = claimPreviewMode(search.preview, process.env.GRAPH_CLAIM_PREVIEW === '1');
      if (preview) result.preview = preview;
      for (const key of ['article', 'concept', 'q', 'node'] as const) {
        if (typeof search[key] === 'string' && search[key]) result[key] = search[key].slice(0, 500);
      }
    }
    return result;
  },
  loader: () => fetchPostSummaries(),
  head: ({ match }) => {
    const title = match.search.view === 'graph' ? pageTitle('graph view — Blog')
      : match.search.tag ? pageTitle(`Posts tagged “${match.search.tag}” — Blog`) : pageTitle('Blog');
    return {
      links: [{ rel: 'canonical', href: canonicalPostUrl() }],
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: canonicalPostUrl() },
      ],
    };
  },
  component: BlogIndex,
});

function BlogIndex() {
  const posts = Route.useLoaderData();
  const search = Route.useSearch();
  const { tag, view, category } = search;
  const navigate = Route.useNavigate();
  const tags = collectTags(posts);
  const tagged = filterByTag(posts, tag);
  const visible = filterByListGroup(tagged, category);
  const categoryKey = category ?? 'future-research';
  const categoryLabel = BLOG_CATEGORIES.find(c => c.key === categoryKey)!.label;
  const otherCategories = BLOG_CATEGORIES.filter(c => c.key !== categoryKey).map(c => ({ ...c,
    group: c.key === 'future-research' ? undefined : c.key,
    count: filterByListGroup(tagged, c.key === 'future-research' ? undefined : c.key).length,
  })).filter(c => c.count > 0);
  const otherCount = otherCategories.reduce((n,c) => n+c.count,0);
  const economy = category === 'current-economy';
  const listSearch = { ...(category ? { category } : {}), ...(tag ? { tag } : {}) };

  if (view === 'graph') return <><p {...stylex.props(shared.muted, heading.formula, heading.canvasFormula)}>KNo(w)des = Knowledge + Nodes</p><Suspense fallback={<p role="status" lang="ja" {...stylex.props(graph.status)}>graph viewを準備しています…</p>}>
    <ParagraphGraph key={search.preview ?? 'production'} search={search} onChange={next => { void navigate({ search: { view: 'graph', ...listSearch, ...next }, replace: next.article === search.article && next.node === search.node, resetScroll: false }); }} />
  </Suspense></>;

  return (
    <div {...stylex.props(blog.grid)}>
      <p {...stylex.props(shared.label, blog.sideLabel)}><span {...stylex.props(shared.amber)}>04</span> / Blog</p>
      <div>
        <p {...stylex.props(shared.muted, heading.formula)}>KNo(w)des = Knowledge + Nodes</p>
        <nav aria-label="ブログの表示" lang="ja" {...stylex.props(graph.viewSwitch)}>
          <Link to="/knowdes" search={listSearch} aria-current={!view ? 'page' : undefined} {...stylex.props(graph.button, !view && graph.buttonActive)}>一覧</Link>
          <Link to="/knowdes" search={{ view: 'graph', ...listSearch }} aria-current={view === 'graph' ? 'page' : undefined} {...stylex.props(graph.button, view === 'graph' && graph.buttonActive)}>graph view</Link>
        </nav>
        <nav aria-label="記事の区分" lang="ja" {...stylex.props(graph.viewSwitch)}>
          {BLOG_CATEGORIES.map(c => <Link key={c.key} to="/knowdes" activeOptions={{ exact: true }} search={{ ...(c.key === 'future-research' ? {} : { category: c.key }), ...(tag ? { tag } : {}) }} aria-current={categoryKey === c.key ? 'page' : undefined} {...stylex.props(graph.button, categoryKey === c.key && graph.buttonActive)}>{c.label}</Link>)}
        </nav>
        {tags.length > 0 && (
          <nav aria-label="Filter posts by tag" {...stylex.props(blog.filters)}>
            <span {...stylex.props(shared.label, blog.filtersLabel)}>Tags</span>
            <Link to="/knowdes" search={category ? { category } : {}} activeOptions={{ exact: true }} {...stylex.props(shared.label, blog.filter, !tag && blog.filterActive)}>All</Link>
            {tags.map((name) => (
              <Link key={name} to="/knowdes" search={{ ...(category ? { category } : {}), tag: name }} activeOptions={{ exact: true }} {...stylex.props(shared.label, blog.filter, tag === name && blog.filterActive)}>
                {name}
              </Link>
            ))}
          </nav>
        )}

        {isLegacyTag(tag) && <p lang="ja" {...stylex.props(blog.empty)}>以前のタグ「{tag}」が付いていた記事を表示しています。</p>}
        <p {...stylex.props(shared.label, blog.listMeta)} aria-live="polite">
          <span>{tag ? `Tagged “${tag}”` : categoryLabel}</span>
          <span>{visible.length} {visible.length === 1 ? 'post' : 'posts'}</span>
        </p>

        {tag && otherCategories.map(c => <p key={c.key} lang="ja" {...stylex.props(blog.empty)}><Link to="/knowdes" search={{ tag, ...(c.group ? { category: c.group } : {}) }} {...stylex.props(shared.textLink)}>{c.label}にも{c.count}件</Link></p>)}
        {visible.length > 0 ? (
          <ul {...stylex.props(blog.list)}>
            {visible.map((post) => (
              <li key={post.slug} {...stylex.props(blog.item, !economy && blog.itemWithoutDate)}>
                {(economy || post.draft) && <p {...stylex.props(shared.label, blog.itemDate)}>
                  {economy && <time dateTime={post.date}>{formatPostDate(post.date)}</time>}
                  {post.draft && <span {...stylex.props(blog.draftBadge)}>Draft</span>}
                </p>}
                <article lang={post.lang} aria-labelledby={`post-${post.slug}`}>
                  <h2 id={`post-${post.slug}`} {...stylex.props(blog.itemTitle)}>
                    <Link to="/knowdes/$slug" params={{ slug: post.slug }} {...stylex.props(blog.itemLink)}>{post.title}</Link>
                  </h2>
                  <p {...stylex.props(blog.itemDescription)}>{post.description}</p>
                  {post.tags.length > 0 && (
                    <ul aria-label="Tags" {...stylex.props(blog.tags)}>
                      {post.tags.map((name) => (
                        <li key={name}><Link to="/knowdes" search={{ ...(category ? { category } : {}), tag: name }} {...stylex.props(blog.tagLink)}>#{name}</Link></li>
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
              {tag ? otherCount > 0 ? `この区分には「${tag}」の記事がありません。 ` : `No posts are tagged “${tag}”. ` : 'No posts yet. '}
              {tag && <Link to="/knowdes" search={category ? { category } : {}} {...stylex.props(shared.textLink)}>Show all posts <span aria-hidden="true">→</span></Link>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
