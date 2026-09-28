import * as stylex from '@stylexjs/stylex';
import { formatPostDate, youTubeEmbedUrl, youTubeWatchUrl, type PostVideo } from './posts';
import { embed } from '../styles/blog.stylex';

/**
 * A responsive 16:9 player on YouTube's privacy-enhanced domain. It loads lazily,
 * never autoplays, and always offers a plain link to the original video.
 * The iframe is built only from a validated video ID; raw HTML frames remain disabled.
 */
export function YouTubeEmbed({ video }: { video: PostVideo }) {
  return (
    <figure {...stylex.props(embed.figure)}>
      <div {...stylex.props(embed.frame)}>
        <iframe
          src={youTubeEmbedUrl(video.youtubeId)}
          title={`YouTube video: ${video.title}`}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          {...stylex.props(embed.iframe)}
        />
      </div>
      <figcaption {...stylex.props(embed.caption)}>
        <span lang="en" {...stylex.props(embed.captionLabel)}>Source video</span>
        <a href={youTubeWatchUrl(video.youtubeId)} target="_blank" rel="noopener noreferrer" {...stylex.props(embed.link)}>
          {video.title}
          <span lang="en" {...stylex.props(embed.external)}> (YouTube, opens in a new tab)</span>
        </a>
        {video.publishedAt && (
          <span lang="en" {...stylex.props(embed.captionLabel)}>
            Published <time dateTime={video.publishedAt}>{formatPostDate(video.publishedAt)}</time>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
