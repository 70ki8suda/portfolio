import { notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { findVisiblePost, getVisiblePosts, visiblePostSourceHash } from './content.server';
import { isPostSlug, seriesPosts, toSummary } from './posts';

export const fetchPostSummaries = createServerFn({ method: 'GET' }).handler(() => getVisiblePosts().map(toSummary));

export const fetchPost = createServerFn({ method: 'GET' })
  .validator((slug: string) => {
    if (typeof slug !== 'string') throw new Error('Expected a post slug');
    return slug;
  })
  .handler(async ({ data: slug }) => {
    const post = isPostSlug(slug) ? findVisiblePost(slug) : undefined;
    if (!post) throw notFound();
    return {
      post,
      sourceHash: await visiblePostSourceHash(slug),
      series: seriesPosts(getVisiblePosts(), post).map(({ slug, title, series }) => ({ slug, title, order: series!.order })),
    };
  });
