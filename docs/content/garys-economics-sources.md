# Garys Economics — source set and audit notes

Scope: the channel's **top ten popular videos** plus **all videos in the
"Understand The Economy Course" playlist**, deduplicated. The fourteen Japanese
explanatory articles were combined into one guide on 2026-09-28, with one chapter
and embedded video for each original article.

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
   - Independent check by the GPT coordinator in a separate browser session on
     2026-09-25 JST (`/tmp/garys-youtube-verified-20260925.md`). It found the same
     top ten and the same 4-video playlist, for the same 14 IDs. The UI showed rank 3's title
     auto-translated into Japanese; `sourceTitle` keeps the original English title from metadata.
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
     captions**. They are lower-fidelity but readable. The article says so. Its
     mirror transcript was *not* read; only the ID's presence on the mirror index was checked.
   - Transcript mirror https://garyseconomics.github.io/transcripts/ is **not
     established as official** and was treated only as secondary. Its index page
     at the snapshot contained only 3 of the 14 IDs (`a-ohZ74hdeI`,
     `kNUNR2NZvFM`, `-k6czLUdJPI`), so it was not used as a primary source.
   - Transcripts/translations are **not** reproduced in this repo, and caption
     text files stay outside it (`/tmp`). Articles contain no direct quotations
     from the videos.
5. `sourcePublishedAt` is taken from the YouTube metadata field `upload_date`, as
   reported by yt-dlp. It is **not** independently verified beyond that
   metadata. The captions agree with it only where a video states its own dates:
   `pUKaB4P5Qns` gives the release as "Sunday the 30th of March", and `T-1s9AykUyU`
   was filmed "Thursday the 10th of April" for release that Sunday. Recording dates
   that differ from the upload date are given in the article body:
   `CivlU8hJVwc` was recorded at the end of 2024, `kNUNR2NZvFM` in December 2023, and
   `pUKaB4P5Qns` before the Spring Statement was published.

## Top ten popular videos (snapshot 2026-09-25)

| Rank | Video ID | Original title | Views (exact, yt-dlp) | Popular-chip label | Published | Length | Captions | Article |
| ---: | --- | --- | ---: | --- | --- | --- | --- | --- |
| 1 | `wPoXOwiEfrQ` | What does Elon Musk want? | 2,512,256 | 251万 | 2025-01-19 | 21:29 | en-GB | `/blog/garys-economics-guide#elon-musk` |
| 2 | `a-ohZ74hdeI` | How To Get Rich | 2,224,223 | 222万 | 2024-04-14 | 15:17 | auto only | `/blog/garys-economics-guide#how-to-get-rich` |
| 3 | `Oi265I48MdI` | The Iran economic shock is coming. How to protect yourself | 2,105,722 | 210万 | 2026-04-05 | 45:07 | en-GB | `/blog/garys-economics-guide#iran-economic-shock` |
| 4 | `IwEVYlkopTY` | Why aren't we all getting rich from compound interest? | 2,023,301 | 202万 | 2025-03-09 | 22:56 | en-GB | `/blog/garys-economics-guide#compound-interest` |
| 5 | `T-1s9AykUyU` | The week Trump nearly crashed the world economy | 1,558,521 | 155万 | 2025-04-13 | 53:33 | en-GB | `/blog/garys-economics-guide#trump-tariff-week` |
| 6 | `XCnImxVWbvc` | Why Labour and Trump will both fail | 1,461,298 | 146万 | 2025-02-16 | 24:20 | en-GB | `/blog/garys-economics-guide#labour-and-trump-will-fail` |
| 7 | `kNUNR2NZvFM` | The Future of House Prices | 1,270,096 | 127万 | 2024-01-07 | 25:28 | en-GB | `/blog/garys-economics-guide#future-of-house-prices` |
| 8 | `-k6czLUdJPI` | Why money obsession is keeping you poor | 1,206,835 | 120万 | 2025-08-24 | 16:04 | en-GB | `/blog/garys-economics-guide#money-obsession` |
| 9 | `pUKaB4P5Qns` | Why Your Living Standards Are Falling - The Squeeze Out | 1,047,802 | 104万 | 2025-03-30 | 28:50 | en-GB | `/blog/garys-economics-guide#squeeze-out` |
| 10 | `rAb_p5DCC3E` | How to stop the economy from collapsing | 1,036,455 | 103万 | 2025-03-16 | 45:01 | en-GB | `/blog/garys-economics-guide#stop-economy-collapsing` |

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
| 1 | `bReS9FLpgT4` | Understand the Economy Part 1: What is wealth? | 381,277 | 2024-06-30 | 13:19 | en-GB | `/blog/garys-economics-guide#wealth` |
| 2 | `TflnQb9E6lw` | Understand the Economy Part 2: What Is Wealth Inequality? | 280,740 | 2024-07-28 | 27:35 | en-GB | `/blog/garys-economics-guide#wealth-inequality` |
| 3 | `CivlU8hJVwc` | Understand the Economy Part 3: Why is Inequality Ignored? | 620,270 | 2025-01-26 | 23:04 | en-GB | `/blog/garys-economics-guide#why-inequality-ignored` |
| 4 | `e9ROtVQt98s` | Understand the Economy Part 4: Inequality is driving everything | 551,221 | 2025-03-02 | 27:21 | en-GB | `/blog/garys-economics-guide#inequality-driving-everything` |

Note: Part 4 ends by promising a next episode on "how do we fix it". At the snapshot
the playlist still had only 4 entries, so no fifth part exists to include.
`rAb_p5DCC3E` (top-ten #10) covers similar ground, but it is **not** in the playlist
and is not labelled as a course part. The two are cross-linked as related reading only.

## Consolidation (2026-09-28)

The fourteen authored articles were consolidated into
`content/posts/garys-economics-guide.md`. The table above now points to the
corresponding chapter. Their substantive explanations, examples, numerical
assumptions, caveats, source dates and ranking snapshot are retained. Repeated
attribution boilerplate and between-post navigation are consolidated into the
introduction, chapter references and table of contents. This does not add a full
transcript or an exhaustive reconstruction of any source video.

- Article date: `2026-09-28`; source publication dates remain in the chapters.
- Tags: `[経済, Garys Economics]`. No deleted placeholder tags are reintroduced.
- One post, with fourteen validated `youtube` fences and explicit chapter IDs.
- Former article URLs redirect permanently to the corresponding chapter.
- Course membership/order and the popularity snapshot remain those verified on
  2026-09-25. The later article date is not a new ranking survey.
- Claude performed consolidation and Japanese editing through Superset; GPT
  checks the final draft against the original fourteen authored articles.

## Editorial guardrails applied (revised after GPT audit, 2026-09-25)

- **Explanatory format.** Articles use topic-specific headings and connected
  Japanese prose. They select the central argument and representative examples
  rather than reconstructing the entire video. The earlier fixed-length
  `動画の内容` / `本記事の補足` template has been retired.
- Source summaries and original explanation are distinguished in the prose.
  Original examples are explicitly hypothetical; they explain a concept, not
  supply evidence for the speaker's empirical claims. The articles contain no
  full transcripts or translations, and the embedded videos remain the source
  for the full discussion.
- Japanese editing checks the logical connection between paragraphs, explains
  unfamiliar terms, and avoids vague literal translations and repetitive
  attribution. Qualifications accompany the claim they qualify instead of
  appearing only in a generic disclaimer at the end.
- An independent GPT review checked the articles against the English captions.
  Corrections and qualifications retained in the final text include:
  - Part 1 uses net equity (£500k home − £400k mortgage = £100k net wealth) and
    borrower liability vs lender claim (債権). It does not say that the lender owns the home.
  - Part 4 does not say that Gary foresaw the 2008 crisis, and it notes that he was not 100% certain.
  - The money-obsession article keeps the "short-term" qualifier on zero-sum.
  - The Iran article states that he does *not* recommend buying oil now. It also narrows his criticism to subsidy-style price caps.
  - Squeeze Out notes that it was recorded before the Spring Statement, treats the stages as his framework, and reads government "no wealth" as net wealth.
- Numbers and events appear only as the speaker's claims at recording time and are not presented as current facts.
- No investment advice. No timestamps and no direct quotations.
- Popularity rank appears in each relevant chapter with its original snapshot date.

## Known gaps

- `a-ohZ74hdeI` relies on auto-generated captions (no uploaded track).
- On-screen material (graphs, the tariff board, handwritten diagrams) is not
  in the captions. Articles describe it only as far as the speech does.
  Specifically, the Piketty/Zucman government-wealth graph in `Oi265I48MdI` /
  `pUKaB4P5Qns` is referenced by the speaker, but its values were not read.
- View counts change continuously; the ranking is valid for the snapshot above.

## Editorial revision (2026-11-11)

- `content/posts/garys-economics-guide.md` was revised for structure and Japanese
  readability. The source set, ranking snapshot, publication dates, video IDs,
  chapter anchors, claims, examples, numbers, caveats and source links were not
  expanded or replaced.
- Every chapter now opens with its source position and length plus a three-point
  orientation, then separates the video's argument, this article's explanation,
  reading cautions and related chapters. Long paragraphs and number-heavy examples
  were split into shorter paragraphs, lists and compact tables.
- No new source claim was added or attributed to Gary. Statements about events and
  figures remain framed as his view at the recording date; hypothetical arithmetic
  remains identified as this article's example.
- The Squeeze Out chapter does not infer missing stage numbers. It retains only the
  existing references to stages 1 and 3, and otherwise presents the sequence in the
  order already described in the article.
- Final GPT comparison retained all 14 video IDs and chapter anchors, all 15 source
  URLs and the original numeric tokens. The 21 blog E2E tests passed, including
  legacy redirects and video embeds. The title/lead and reader-facing stage
  explanation received a final editorial pass. Source videos were not re-audited.
