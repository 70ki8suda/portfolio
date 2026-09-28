import * as stylex from '@stylexjs/stylex';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { GARYS_GUIDE_SLUG, legacyGarysChapter } from '../../blog/legacyPosts';
import { fetchPost } from '../../blog/api';
import { Markdown } from '../../blog/Markdown';
import { formatPostDate } from '../../blog/posts';
import { YouTubeEmbed } from '../../blog/YouTubeEmbed';
import { NotFoundMessage } from '../../components/NotFoundPage';
import { blog, seriesNav } from '../../styles/blog.stylex';
import { shared } from '../../styles/shared.stylex';
import { pageTitle } from '../../site';

export const Route = createFileRoute('/blog/$slug')({
  loader: ({ params }) => {
    const chapter = legacyGarysChapter(params.slug);
    if (chapter) throw redirect({ to: '/blog/$slug', params: { slug: GARYS_GUIDE_SLUG }, hash: chapter, statusCode: 301 });
    return fetchPost({ data: params.slug });
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: pageTitle('Post not found') }] };
    const { post } = loaderData;
    const title = pageTitle(post.title);
    return {
      meta: [
        { title },
        { name: 'description', content: post.description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: post.description },
        { property: 'og:type', content: 'article' },
        { property: 'og:locale', content: post.lang === 'ja' ? 'ja_JP' : 'en_US' },
        { property: 'article:published_time', content: post.date },
      ],
    };
  },
  notFoundComponent: () => (
    <NotFoundMessage title="Post not found." body="This post doesn’t exist, or it hasn’t been published yet." />
  ),
  component: PostPage,
});

function PostPage() {
  const { post, series } = Route.useLoaderData();

  return (
    <div {...stylex.props(blog.grid)}>
      <aside aria-label="Post details" {...stylex.props(blog.sticky, blog.articleMeta)}>
        <Link to="/blog" {...stylex.props(shared.textLink, blog.back)}><span aria-hidden="true">←</span> All posts</Link>
        <p {...stylex.props(shared.label, blog.sideLabel)}>
          <time dateTime={post.date}>{formatPostDate(post.date)}</time>
          {post.draft && <span {...stylex.props(blog.draftBadge)}>Draft</span>}
        </p>
        {post.series && series.length > 1 && (
          <p {...stylex.props(shared.label, shared.soft)}>Part {post.series.order} of {series.length}</p>
        )}
        {post.tags.length > 0 && (
          <ul aria-label="Tags" {...stylex.props(blog.tags)}>
            {post.tags.map((tag) => (
              <li key={tag}><Link to="/blog" search={{ tag }} {...stylex.props(blog.tagLink)}>#{tag}</Link></li>
            ))}
          </ul>
        )}
      </aside>

      <div>
        <article lang={post.lang} aria-labelledby="post-title">
          <header {...stylex.props(blog.articleHeader)}>
            <h1 id="post-title" {...stylex.props(blog.articleTitle)}>{post.title}</h1>
            <p {...stylex.props(blog.articleLead)}>{post.description}</p>
          </header>
          {post.video && <YouTubeEmbed video={post.video} />}
          <Markdown source={post.body} />
        </article>

        {post.series && series.length > 1 && (
          <nav aria-labelledby="series-heading" {...stylex.props(seriesNav.root)}>
            <h2 id="series-heading" {...stylex.props(shared.label, seriesNav.heading)}>
              Series / <span lang={post.lang}>{post.series.name}</span>
            </h2>
            <ol {...stylex.props(seriesNav.list)}>
              {series.map((part) => (
                <li key={part.slug} {...stylex.props(seriesNav.item)}>
                  <span {...stylex.props(seriesNav.order)}>{String(part.order).padStart(2, '0')}</span>
                  {part.slug === post.slug
                    ? <span aria-current="page" lang={post.lang} {...stylex.props(seriesNav.current)}>{part.title}</span>
                    : <Link to="/blog/$slug" params={{ slug: part.slug }} lang={post.lang} {...stylex.props(seriesNav.link)}>{part.title}</Link>}
                </li>
              ))}
            </ol>
          </nav>
        )}

        <footer {...stylex.props(blog.articleFooter)}>
          <Link to="/blog" {...stylex.props(shared.textLink, blog.back)}><span aria-hidden="true">←</span> All posts</Link>
          <span {...stylex.props(shared.label, shared.soft)}>{formatPostDate(post.date)}</span>
        </footer>
      </div>
    </div>
  );
}
