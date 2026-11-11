import * as stylex from '@stylexjs/stylex';
import { createFileRoute, Link } from '@tanstack/react-router';
import { fetchPostSummaries } from '../../blog/api';
import { collectTags, filterByTag, formatPostDate } from '../../blog/posts';
import { blog } from '../../styles/blog.stylex';
import { shared } from '../../styles/shared.stylex';
import { pageTitle } from '../../site';

interface BlogSearch {
  tag?: string;
}

const description = 'Notes by 70ki8suda on technology, economics, and the systems that shape our lives.';

export const Route = createFileRoute('/blog/')({
  validateSearch: (search: Record<string, unknown>): BlogSearch => {
    const tag = typeof search.tag === 'string' ? search.tag.trim() : '';
    return tag ? { tag } : {};
  },
  loader: () => fetchPostSummaries(),
  head: ({ match }) => {
    const title = match.search.tag ? pageTitle(`Posts tagged “${match.search.tag}” — Blog`) : pageTitle('Blog');
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
  const { tag } = Route.useSearch();
  const tags = collectTags(posts);
  const visible = filterByTag(posts, tag);

  return (
    <div {...stylex.props(blog.grid)}>
      <p {...stylex.props(shared.label, blog.sideLabel)}><span {...stylex.props(shared.amber)}>04</span> / Blog</p>
      <div>
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
