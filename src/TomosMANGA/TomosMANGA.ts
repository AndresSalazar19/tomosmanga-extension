import {
  Chapter,
  ChapterDetails,
  ContentRating,
  HomeSection,
  HomeSectionType,
  Manga,
  MangaStatus,
  MangaTile,
  PagedResults,
  SearchRequest,
  Source,
  SourceInfo,
  TagSection,
  Tag,
  Request,
  Response,
} from "@paperback/types";

const BASE_URL = "https://tomosmanga.com";

export const TomosMANGAInfo: SourceInfo = {
  version: "1.0.0",
  name: "TomosMANGA",
  description:
    "Extensión para descargar mangas y comics en español desde TomosMANGA",
  author: "TuNombre",
  authorWebsite: "https://github.com/TuNombre",
  icon: "icon.png",
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: BASE_URL,
  sourceTags: [
    {
      text: "Español",
      type: "grey",
    },
  ],
};

export class TomosMANGA extends Source {
  readonly requestManager = App.createRequestManager({
    requestsPerSecond: 2,
    requestTimeout: 15000,
    interceptor: {
      interceptRequest: async (request: Request): Promise<Request> => {
        request.headers = {
          ...(request.headers ?? {}),
          referer: BASE_URL,
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        };
        return request;
      },
      interceptResponse: async (response: Response): Promise<Response> => {
        return response;
      },
    },
  });

  // ─── Manga Details ───────────────────────────────────────────────────────────

  override async getMangaDetails(mangaId: string): Promise<Manga> {
    const url = `${BASE_URL}/${mangaId}/`;
    const request = App.createRequest({ url, method: "GET" });
    const response = await this.requestManager.schedule(request, 1);
    const $ = this.cheerio.load(response.data as string);

    // Title: h1 heading
    const title = $("h1.entry-title, h1").first().text().trim();

    // Cover image
    const image =
      $(".entry-content img").first().attr("src") ??
      $("img.wp-post-image").first().attr("src") ??
      "";

    // Description / Synopsis
    const descEl = $(".entry-content p").first();
    const description = descEl.text().trim();

    // Status
    const statusText = $(".entry-content")
      .text()
      .match(/Estado[:\s]+([^\|]+)/i)?.[1]
      ?.trim()
      .toLowerCase();
    let status = MangaStatus.UNKNOWN;
    if (statusText?.includes("publicaci")) status = MangaStatus.ONGOING;
    else if (statusText?.includes("completo")) status = MangaStatus.COMPLETED;

    // Tags / Categories
    const tags: Tag[] = [];
    $(".entry-footer .cat-links a, .entry-content a[rel='category tag']").each(
      (_, el) => {
        const label = $(el).text().trim();
        const id = $(el).attr("href")?.replace(BASE_URL, "").replace(/\//g, "") ?? label;
        if (label) tags.push(App.createTag({ id, label }));
      }
    );

    const tagSections: TagSection[] = tags.length
      ? [App.createTagSection({ id: "genres", label: "Géneros", tags })]
      : [];

    return App.createManga({
      id: mangaId,
      titles: [title],
      image,
      status,
      desc: description,
      tags: tagSections,
    });
  }

  // ─── Chapters ────────────────────────────────────────────────────────────────
  // TomosMANGA distributes whole volumes (tomos) as download links, not
  // individual chapters. Each download link is treated as one "chapter".

  override async getChapters(mangaId: string): Promise<Chapter[]> {
    const url = `${BASE_URL}/${mangaId}/`;
    const request = App.createRequest({ url, method: "GET" });
    const response = await this.requestManager.schedule(request, 1);
    const $ = this.cheerio.load(response.data as string);

    const chapters: Chapter[] = [];

    // Grab all download links from the first mirror section (Terabox preferred)
    // Links are plain <a> tags inside .entry-content
    const seen = new Set<string>();

    $(".entry-content a[href*='terabox.com'], .entry-content a[href*='ouo.io']").each(
      (index, el) => {
        const href = $(el).attr("href") ?? "";
        const label = $(el).text().trim();
        if (!href || seen.has(label)) return;
        seen.add(label);

        // Extract volume numbers from label, e.g. "Chainsaw Man Tomo 23" -> 23
        const numMatch = label.match(/(\d[\d\s\-]+)$/);
        const chapNum = numMatch ? parseFloat(numMatch[1].replace(/\s/g, "")) : index + 1;

        chapters.push(
          App.createChapter({
            id: href,
            mangaId,
            name: label,
            chapNum,
            langCode: "es",
          })
        );
      }
    );

    // If nothing found with Terabox, try any link inside the content
    if (chapters.length === 0) {
      $(".entry-content a[href]").each((index, el) => {
        const href = $(el).attr("href") ?? "";
        const label = $(el).text().trim();
        if (
          !href ||
          !label ||
          href.startsWith(BASE_URL) ||
          href.startsWith("#")
        )
          return;

        chapters.push(
          App.createChapter({
            id: href,
            mangaId,
            name: label,
            chapNum: index + 1,
            langCode: "es",
          })
        );
      });
    }

    return chapters.reverse(); // ascending order
  }

  // ─── Chapter Details (pages) ─────────────────────────────────────────────────
  // Since tomosmanga distributes files (CBR/CBZ) via external hosts, we cannot
  // serve individual pages. We return a single page with the external download URL.

  override async getChapterDetails(
    mangaId: string,
    chapterId: string
  ): Promise<ChapterDetails> {
    return App.createChapterDetails({
      id: chapterId,
      mangaId,
      pages: [chapterId], // The external download URL acts as the single "page"
    });
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

  override async getSearchResults(
    query: SearchRequest,
    metadata: unknown
  ): Promise<PagedResults> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const searchTerm = encodeURIComponent(query.title ?? "");
    const url = `${BASE_URL}/?s=${searchTerm}&_page=${page}`;

    const request = App.createRequest({ url, method: "GET" });
    const response = await this.requestManager.schedule(request, 1);
    const $ = this.cheerio.load(response.data as string);

    const tiles: MangaTile[] = [];

    $("article.post, .post-entry").each((_, el) => {
      const anchor = $(el).find("a").first();
      const href = anchor.attr("href") ?? "";
      const id = this.extractIdFromUrl(href);
      if (!id) return;

      const titleText =
        $(el).find("h2, h3, .entry-title").first().text().trim() ||
        anchor.attr("title") ||
        "";
      const image =
        $(el).find("img").first().attr("src") ??
        $(el).find("img").first().attr("data-src") ??
        "";

      tiles.push(
        App.createMangaTile({
          id,
          title: App.createIconText({ text: titleText }),
          image,
        })
      );
    });

    const hasNext = $("a.next.page-numbers, .nav-links .next").length > 0;

    return App.createPagedResults({
      results: tiles,
      metadata: hasNext ? { page: page + 1 } : undefined,
    });
  }

  // ─── Home Sections ───────────────────────────────────────────────────────────

  override async getHomePageSections(
    sectionCallback: (section: HomeSection) => void
  ): Promise<void> {
    // 1) Últimas entradas (latest manga)
    const latestSection = App.createHomeSection({
      id: "latest",
      title: "Últimas Entradas",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: true,
    });
    sectionCallback(latestSection);

    // 2) Manhwa
    const manhwaSection = App.createHomeSection({
      id: "manhwa",
      title: "Manhwa",
      type: HomeSectionType.singleRowNormal,
      containsMoreItems: true,
    });
    sectionCallback(manhwaSection);

    // Fetch home page
    const request = App.createRequest({ url: BASE_URL, method: "GET" });
    const response = await this.requestManager.schedule(request, 1);
    const $ = this.cheerio.load(response.data as string);

    // Parse latest section (main grid)
    const latestTiles: MangaTile[] = [];
    $("main article.post, main .post-entry, .site-main article").each(
      (_, el) => {
        const anchor = $(el).find("h2 a, h3 a, .entry-title a").first();
        const href = anchor.attr("href") ?? "";
        const id = this.extractIdFromUrl(href);
        if (!id) return;

        const titleText = anchor.text().trim();
        const image =
          $(el).find("img").first().attr("src") ??
          $(el).find("img").first().attr("data-src") ??
          "";

        latestTiles.push(
          App.createMangaTile({
            id,
            title: App.createIconText({ text: titleText }),
            image,
          })
        );
      }
    );

    latestSection.items = latestTiles;
    sectionCallback(latestSection);

    // Parse Manhwa section - look for the Manhwa header and its adjacent articles
    const manhwaTiles: MangaTile[] = [];
    // tomosmanga.com has a separate Manhwa section below the main articles
    // identified by a heading
    $("h2, h3").each((_, heading) => {
      if ($(heading).text().toLowerCase().includes("manhwa")) {
        $(heading)
          .nextAll("article, .post-entry")
          .slice(0, 8)
          .each((__, el) => {
            const anchor = $(el).find("a").first();
            const href = anchor.attr("href") ?? "";
            const id = this.extractIdFromUrl(href);
            if (!id) return;

            const titleText =
              $(el).find("h2, h3, .entry-title").first().text().trim() ||
              anchor.attr("title") ||
              "";
            const image =
              $(el).find("img").first().attr("src") ??
              $(el).find("img").first().attr("data-src") ??
              "";

            manhwaTiles.push(
              App.createMangaTile({
                id,
                title: App.createIconText({ text: titleText }),
                image,
              })
            );
          });
      }
    });

    manhwaSection.items = manhwaTiles;
    sectionCallback(manhwaSection);
  }

  override async getViewMoreItems(
    homepageSectionId: string,
    metadata: unknown
  ): Promise<PagedResults> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;

    let url: string;
    switch (homepageSectionId) {
      case "manhwa":
        url = `${BASE_URL}/manhwa/?_page=${page}`;
        break;
      case "latest":
      default:
        url = `${BASE_URL}/?_page=${page}`;
        break;
    }

    const request = App.createRequest({ url, method: "GET" });
    const response = await this.requestManager.schedule(request, 1);
    const $ = this.cheerio.load(response.data as string);

    const tiles: MangaTile[] = [];
    $("article.post, .post-entry, main article").each((_, el) => {
      const anchor = $(el).find("h2 a, h3 a, .entry-title a").first();
      const href = anchor.attr("href") ?? "";
      const id = this.extractIdFromUrl(href);
      if (!id) return;

      const titleText = anchor.text().trim();
      const image =
        $(el).find("img").first().attr("src") ??
        $(el).find("img").first().attr("data-src") ??
        "";

      tiles.push(
        App.createMangaTile({
          id,
          title: App.createIconText({ text: titleText }),
          image,
        })
      );
    });

    const hasNext = $("a.next.page-numbers, .nav-links .next").length > 0;

    return App.createPagedResults({
      results: tiles,
      metadata: hasNext ? { page: page + 1 } : undefined,
    });
  }

  // ─── Tags / Genres ────────────────────────────────────────────────────────────

  override async getTags(): Promise<TagSection[]> {
    const tags: Tag[] = [
      { id: "manga/shonen", label: "Shōnen" },
      { id: "manga/seinen", label: "Seinen" },
      { id: "manga/shojo", label: "Shōjo" },
      { id: "manhwa", label: "Manhwa" },
      { id: "comic/dc-comic", label: "DC Comics" },
      { id: "comic/marvel", label: "Marvel" },
      { id: "comic/otros", label: "Otros Comics" },
      { id: "mangas-en-publicacion", label: "En Publicación" },
      { id: "mangas-completos", label: "Completados" },
    ].map((t) => App.createTag(t));

    return [
      App.createTagSection({ id: "categories", label: "Categorías", tags }),
    ];
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Converts a full URL like https://tomosmanga.com/chainsaw-man/ → chainsaw-man */
  private extractIdFromUrl(url: string): string {
    if (!url.startsWith(BASE_URL)) return "";
    return url
      .replace(BASE_URL, "")
      .replace(/^\/|\/$/g, "")
      .split("?")[0] ?? "";
  }
}
