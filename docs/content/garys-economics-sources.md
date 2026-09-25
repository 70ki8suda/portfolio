# Garys Economics — source set and audit notes

Owner: `garys-articles` worker. Scope: the channel's **top ten popular videos** plus
**all videos in the "Understand The Economy Course" playlist**, one Japanese
explanatory article per video, deduplicated.

Snapshot date: **2026-09-25** (metadata fetched 2026-09-25 06:41–06:42 UTC).

## Channel

| Field | Value |
| --- | --- |
| Channel | Garys Economics (`@garyseconomics`) |
| Channel ID | `UC5Ghe5TBQGYIOANuiNW4hDQ` |
| Videos tab | https://www.youtube.com/@garyseconomics/videos |
| Uploads on Videos tab at snapshot | 232 (Shorts are a separate tab and are excluded by YouTube's Videos-tab Popular sort; `yt-dlp …/streams` returned no Live entries) |
| Official website | https://garyseconomics.org/ |

## How the set was established

1. **Popular ranking — two independent checks, same result.**
   - `yt-dlp 2026.08.19 --flat-playlist -J https://www.youtube.com/@garyseconomics/videos`
     returned all 232 Videos-tab uploads with view counts. Sorting by
     `view_count` gave the order below.
   - Per-video `yt-dlp --skip-download --write-info-json` gave exact
     `view_count`, `upload_date` and duration for the candidates (ranks 1–13 and the course).
   - Cross-check in a real browser: on the Videos tab, the YouTube sort chip
     **人気の動画 (Popular)** was selected (`aria-selected=true`) and the first
     13 cards were read. Their order and rounded counts (e.g. 251万, 222万 … 90万)
     match the yt-dlp order exactly.
   - The ranking comes from the channel's Popular sort and view counts only.
     Editorial picks and "best of year" lists were not used.
2. **Course membership/order**: `yt-dlp --flat-playlist` on the playlist
   `PLXuOBKrmFYbKytq9mkcd62sJPb6w12vpU` ("Understand The Economy Course",
   found via the channel's Playlists tab). `playlist_count` = **4**, playlist
   `modified_date` = 2025-03-02. The playlist order matches the "Part N" numbering in the titles.
3. **Overlap**: none of the 4 course videos is in the top ten (the highest-viewed course
   video, Part 3, has 620,270 views; rank 10 has 1,036,455). **Total = 14 unique videos.**
4. **Content grounding**: every article is based on the video's own YouTube
   caption track, read as text (no audio/video downloaded):
   - 13 videos have an uploaded **en-GB subtitle track** (`subtitles.en-GB`, not
     auto-generated).
   - `a-ohZ74hdeI` ("How To Get Rich") has **only auto-generated English
     captions**. It is lower-fidelity but readable and was cross-checked with the
     transcript mirror (below).
   - Transcript mirror https://garyseconomics.github.io/transcripts/ is **not
     established as official** and was treated only as secondary. Its index page
     at the snapshot contained only 3 of the 14 IDs (`a-ohZ74hdeI`,
     `kNUNR2NZvFM`, `-k6czLUdJPI`), so it was not used as a primary source.
   - Transcripts/translations are **not** reproduced in this repo. Articles are
     original Japanese summaries plus commentary. Each article quotes at most one short
     English phrase.
5. `sourcePublishedAt` = yt-dlp `upload_date`. Spot-check: the upload days
   are Sundays, which matches the channel's weekly Sunday schedule. Two videos
   also state their own release/filming dates, and those agree: `pUKaB4P5Qns`
   says "Sunday the 30th of March", and `T-1s9AykUyU` says it was filmed
   "Thursday the 10th of April" for Sunday release.

## Top ten popular videos (snapshot 2026-09-25)

| Rank | Video ID | Original title | Views (exact, yt-dlp) | Popular-chip label | Published | Length | Captions | Article |
| ---: | --- | --- | ---: | --- | --- | --- | --- | --- |
| 1 | `wPoXOwiEfrQ` | What does Elon Musk want? | 2,512,256 | 251万 | 2025-01-19 | 21:29 | en-GB | `content/posts/garys-elon-musk.md` |
| 2 | `a-ohZ74hdeI` | How To Get Rich | 2,224,223 | 222万 | 2024-04-14 | 15:17 | auto only | `content/posts/garys-how-to-get-rich.md` |
| 3 | `Oi265I48MdI` | The Iran economic shock is coming. How to protect yourself | 2,105,722 | 210万 | 2026-04-05 | 45:07 | en-GB | `content/posts/garys-iran-economic-shock.md` |
| 4 | `IwEVYlkopTY` | Why aren't we all getting rich from compound interest? | 2,023,301 | 202万 | 2025-03-09 | 22:56 | en-GB | `content/posts/garys-compound-interest.md` |
| 5 | `T-1s9AykUyU` | The week Trump nearly crashed the world economy | 1,558,521 | 155万 | 2025-04-13 | 53:33 | en-GB | `content/posts/garys-trump-tariff-week.md` |
| 6 | `XCnImxVWbvc` | Why Labour and Trump will both fail | 1,461,298 | 146万 | 2025-02-16 | 24:20 | en-GB | `content/posts/garys-labour-and-trump-will-fail.md` |
| 7 | `kNUNR2NZvFM` | The Future of House Prices | 1,270,096 | 127万 | 2024-01-07 | 25:28 | en-GB | `content/posts/garys-future-of-house-prices.md` |
| 8 | `-k6czLUdJPI` | Why money obsession is keeping you poor | 1,206,835 | 120万 | 2025-08-24 | 16:04 | en-GB | `content/posts/garys-money-obsession.md` |
| 9 | `pUKaB4P5Qns` | Why Your Living Standards Are Falling - The Squeeze Out | 1,047,802 | 104万 | 2025-03-30 | 28:50 | en-GB | `content/posts/garys-squeeze-out.md` |
| 10 | `rAb_p5DCC3E` | How to stop the economy from collapsing | 1,036,455 | 103万 | 2025-03-16 | 45:01 | en-GB | `content/posts/garys-stop-economy-collapsing.md` |

**Ranks just outside the top ten (not included):**

| Rank | Video ID | Title | Views | Published |
| ---: | --- | --- | ---: | --- |
| 11 | `BTlUyS-T-_4` | The REAL reason behind the housing crisis | 1,020,529 | 2025-07-20 |
| 12 | `TSs18iYE20w` | Have I been wrong on the economy the whole time? | 915,556 | 2026-04-19 |
| 13 | `m6lObdE3s10` | The games and strategy of rich people. What I learnt at Citibank | 900,585 | 2025-01-30 |

> **Stability caveat:** rank 10 (`rAb_p5DCC3E`) is only **15,926 views** ahead of
> rank 11 (`BTlUyS-T-_4`). Rank 9 is only 11,347 views ahead of rank 10. The
> top-ten membership is correct as of this snapshot but could change soon.

## Understand The Economy Course (all videos)

Playlist: https://www.youtube.com/playlist?list=PLXuOBKrmFYbKytq9mkcd62sJPb6w12vpU

| Order | Video ID | Original title | Views | Published | Length | Captions | Article |
| ---: | --- | --- | ---: | --- | --- | --- | --- |
| 1 | `bReS9FLpgT4` | Understand the Economy Part 1: What is wealth? | 381,277 | 2024-06-30 | 13:19 | en-GB | `content/posts/garys-understand-economy-1-what-is-wealth.md` |
| 2 | `TflnQb9E6lw` | Understand the Economy Part 2: What Is Wealth Inequality? | 280,740 | 2024-07-28 | 27:35 | en-GB | `content/posts/garys-understand-economy-2-wealth-inequality.md` |
| 3 | `CivlU8hJVwc` | Understand the Economy Part 3: Why is Inequality Ignored? | 620,270 | 2025-01-26 | 23:04 | en-GB | `content/posts/garys-understand-economy-3-why-inequality-ignored.md` |
| 4 | `e9ROtVQt98s` | Understand the Economy Part 4: Inequality is driving everything | 551,221 | 2025-03-02 | 27:21 | en-GB | `content/posts/garys-understand-economy-4-inequality-driving-everything.md` |

Note: Part 4 ends by promising a next episode on "how do we fix it". At the snapshot
the playlist still had only 4 entries, so no fifth part exists to include.
`rAb_p5DCC3E` (top-ten #10) covers similar ground, but it is **not** in the playlist
and is not labelled as a course part. The two are cross-linked as related reading only.

## Frontmatter decisions

- `date: "2026-09-25"` for all articles (article date, not source date).
- `series: "Understand the Economy"` + `seriesOrder` 1–4 only for the 4 verified playlist entries.
- Top-ten articles use `tags: [経済, Garys Economics, 人気動画]`; course articles use `[経済, Garys Economics, コース]`.
- `draft: false` for all 14: each has a readable caption track that was read in full.
- Popularity rank is stated in the body with its snapshot date instead of a new
  frontmatter field, to keep to the agreed contract.
- Cross-links use the blog's `/blog/<slug>` convention.

## Editorial guardrails applied

- Each article separates "動画でGaryが言っていること" (source-derived, concise)
  from "編集部の解説" (original commentary). The commentary notes where Gary's
  view differs from mainstream economics or is contested.
- Numbers and events come only from the videos, labelled as the speaker's claim at recording time. This includes rates, prices, government borrowing costs, and his descriptions of the Iran war and the 2025 tariffs. None are presented as current facts.
- No investment advice. When Gary describes his own trades or portfolio, the articles say that it is his personal situation.
- No timestamps are given. Article text contains no invented quotes; quoted phrases are ≤ 25 words and appear in the captions.

## Known gaps

- `a-ohZ74hdeI` relies on auto-generated captions (no uploaded track).
- On-screen material (graphs, the tariff board, handwritten diagrams) is not
  in the captions. Articles describe it only as far as the speech does.
  Specifically, the Piketty/Zucman government-wealth graph in `Oi265I48MdI` /
  `pUKaB4P5Qns` is referenced by the speaker, but its values were not read.
- View counts change continuously; the ranking is valid for the snapshot above.
