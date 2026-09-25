---
title: "Sample: A field guide to Markdown on this blog"
date: 2026-09-24
description: A sample post that exercises every supported Markdown feature — headings, lists, links, images, code, tables, and more.
tags: [sample, markdown, reference]
lang: en
---

> **This is a sample article.** It exists to show how posts render. Replace or delete it when you publish your own writing.

Posts are plain Markdown files in `content/posts/`. The file name becomes the URL, so this file, `sample-markdown-field-guide.md`, lives at `/blog/sample-markdown-field-guide`.

## Text

Paragraphs are separated by a blank line. You can use **strong emphasis**, *emphasis*, ~~strikethrough~~, and `inline code`. Links work as expected: [the Nodex repository](https://github.com/70ki8suda/nodex), or a link to [another post on this blog](/blog/sample-writing-slowly).

Bare URLs are linked automatically too: https://github.com/70ki8suda

## Lists

- Rooted in nature.
- Connected with care.
  - Nested items are indented by two spaces.
- Free to slow down.

1. Write the post.
2. Preview it locally.
3. Commit it.

- [x] Task lists are supported
- [ ] and render as read-only checkboxes

## Images

Images in `public/` are referenced from the site root. Always write alt text that describes the image.

![A square grid crossed by one diagonal, with a blue and an amber node](/blog/sample-signal-grid.svg)

## Code

Fenced code blocks keep their formatting. Long lines scroll inside the block instead of widening the page:

```ts
export function parsePost(file: string, source: string): Post {
  const slug = slugFromPath(file); // `content/posts/hello-world.md` → `hello-world`, and the rest of this comment is deliberately long to show horizontal scrolling
  return { slug, ...validateFrontmatter(file, source) };
}
```

```sh
npm run dev
```

## Tables

| Element      | Markdown                 |
| ------------ | ------------------------ |
| Heading      | `## Section`             |
| Link         | `[text](https://…)`      |
| Image        | `![alt text](/path.png)` |
| Code block   | three backticks          |

### A smaller heading

Headings from `##` downward structure the article. The post title is already the page's top-level heading, so a `#` heading in the body is shown at the same level as `##`.

---

Raw HTML is ignored: the tags in <span style="color:red">this sentence</span> are dropped and only their text remains, so a post can never run scripts, embed frames, or restyle the page. Videos are added through frontmatter instead (see the README).
