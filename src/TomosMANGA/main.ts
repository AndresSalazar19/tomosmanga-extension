/* SPDX-License-Identifier: GPL-3.0-or-later */

import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type MangaProviding,
  type PagedResults,
  type SearchFilter,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SourceManga,
} from "@paperback/types";

import { MainInterceptor } from "./network";

const BASE_URL = "https://tomosmanga.com";

type TomosMANGAImplementation = Extension &
  DiscoverSectionProviding &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding;

export class TomosMANGAExtension implements TomosMANGAImplementation {
  mainRateLimiter = new BasicRateLimiter("main", {
    numberOfRequests: 3,
    bufferInterval: 10,
    ignoreImages: true,
  });

  mainInterceptor = new MainInterceptor("main");

  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.mainInterceptor.registerInterceptor();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async getHTML(url: string): Promise<string> {
    const [, data] = await Application.scheduleRequest({
      url,
      method: "GET",
    });
    return Application.arrayBufferToUTF8String(data);
  }

  // ─── Discover Sections ──────────────────────────────────────────────────────

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "latest",
        title: "Últimas Entradas",
        type: DiscoverSectionType.prominentCarousel,
      },
      {
        id: "manhwa",
        title: "Manhwa",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "en-publicacion",
        title: "En Publicación",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "completos",
        title: "Completos",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: { page?: number } | undefined
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;

    let url: string;
    switch (section.id) {
      case "manhwa":
        url = `${BASE_URL}/manhwa/?_page=${page}`;
        break;
      case "en-publicacion":
        url = `${BASE_URL}/mangas-en-publicacion/?_page=${page}`;
        break;
      case "completos":
        url = `${BASE_URL}/mangas-completos/?_page=${page}`;
        break;
      case "latest":
      default:
        url = `${BASE_URL}/?_page=${page}`;
        break;
    }

    const html = await this.getHTML(url);
    const entries = parseEntries(html);
    const hasNext = html.includes('class="next page-numbers"') || html.includes('rel="next"');

    const items: DiscoverSectionItem[] = entries.map((e) => {
      if (section.type === DiscoverSectionType.prominentCarousel) {
        return {
          mangaId: e.id,
          title: e.title,
          imageUrl: e.imageUrl,
          type: "prominentCarouselItem",
        } as DiscoverSectionItem;
      }
      return {
        mangaId: e.id,
        title: e.title,
        imageUrl: e.imageUrl,
        type: "simpleCarouselItem",
      } as DiscoverSectionItem;
    });

    return {
      items,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  async getSearchFilters(): Promise<SearchFilter[]> {
    return [
      {
        id: "categoria",
        type: "dropdown",
        options: [
          { id: "", value: "Todos" },
          { id: "/manga/shonen/", value: "Shonen" },
          { id: "/manga/seinen/", value: "Seinen" },
          { id: "/manga/shojo/", value: "Shojo" },
          { id: "/manhwa/", value: "Manhwa" },
          { id: "/comic/dc-comic/", value: "DC Comics" },
          { id: "/comic/marvel/", value: "Marvel" },
          { id: "/comic/otros/", value: "Otros Comics" },
          { id: "/mangas-completos/", value: "Completos" },
          { id: "/mangas-en-publicacion/", value: "En Publicacion" },
        ],
        value: "",
        title: "Categoria",
      },
    ];
  }

  async getSearchResults(
    query: SearchQuery,
    metadata: { page?: number } | undefined
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const categoryFilter = (query.filters?.[0]?.value as string) ?? "";
    const searchTerm = encodeURIComponent(query.title ?? "");

    let url: string;
    if (categoryFilter && !query.title) {
      url = `${BASE_URL}${categoryFilter}?_page=${page}`;
    } else {
      url = `${BASE_URL}/?s=${searchTerm}&_page=${page}`;
    }

    const html = await this.getHTML(url);
    const entries = parseEntries(html);
    const hasNext = html.includes('class="next page-numbers"') || html.includes('rel="next"');

    const items: SearchResultItem[] = entries.map((e) => ({
      mangaId: e.id,
      title: e.title,
      imageUrl: e.imageUrl,
    }));

    return {
      items,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  // ─── Manga Details ───────────────────────────────────────────────────────────

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = `${BASE_URL}/${mangaId}/`;
    const html = await this.getHTML(url);

    // Title
    const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
      ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const primaryTitle = stripTags(titleMatch?.[1] ?? "Unknown").trim();

    // Thumbnail - first img inside entry-content
    const thumbMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
    const thumbnailUrl = thumbMatch?.[1] ?? "";

    // Synopsis - text after SINOPSIS bold tag
    const synopsisMatch = html.match(/SINOPSIS[\s\S]*?<\/strong>\s*<\/p>\s*<p>([\s\S]*?)<\/p>/i)
      ?? html.match(/SINOPSIS[\s\S]{0,200}<p>([\s\S]*?)<\/p>/i);
    const synopsis = stripTags(synopsisMatch?.[1] ?? "Sin sinopsis.").trim();

    // Status
    const statusMatch = html.match(/Estado[:\s]+([^<|]+)/i);
    const statusText = (statusMatch?.[1] ?? "").trim().toLowerCase();
    let status = "Unknown";
    if (statusText.includes("publicaci")) status = "Ongoing";
    else if (statusText.includes("completo")) status = "Completed";

    // Genres from category links
    const genreTags: { id: string; title: string }[] = [];
    const catRegex = /rel="category tag"[^>]*>([\s\S]*?)<\/a>/gi;
    let catMatch;
    while ((catMatch = catRegex.exec(html)) !== null) {
      const title = stripTags(catMatch[1] ?? "").trim();
      if (title) genreTags.push({ id: title.toLowerCase().replace(/\s+/g, "-"), title });
    }

    return {
      mangaId,
      mangaInfo: {
        primaryTitle,
        secondaryTitles: [],
        thumbnailUrl,
        synopsis,
        contentRating: ContentRating.EVERYONE,
        status,
        tagGroups: genreTags.length
          ? [{ id: "genres", title: "Generos", tags: genreTags }]
          : [],
        shareUrl: url,
      },
    };
  }

  // ─── Chapters ────────────────────────────────────────────────────────────────

  async getChapters(
    sourceManga: SourceManga,
    sinceDate?: Date
  ): Promise<Chapter[]> {
    void sinceDate;

    const url = `${BASE_URL}/${sourceManga.mangaId}/`;
    const html = await this.getHTML(url);

    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    // Extract entry-content block first
    const contentMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    const content = contentMatch?.[1] ?? html;

    // Find Terabox links first, fallback to ouo.io, fallback to any external
    const patterns = [
      /href="(https?:\/\/[^"]*terabox\.com[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      /href="(https?:\/\/[^"]*ouo\.io[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      /href="(https?:\/\/(?!tomosmanga)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ];

    for (const pattern of patterns) {
      if (chapters.length > 0) break;
      let match;
      let index = 0;
      while ((match = pattern.exec(content)) !== null) {
        const href = match[1] ?? "";
        const label = stripTags(match[2] ?? "").trim();
        if (!href || !label || seen.has(label)) continue;
        seen.add(label);

        const nums = label.match(/\d+/g);
        const chapNum = nums ? parseFloat(nums[nums.length - 1] ?? String(index + 1)) : index + 1;

        chapters.push({
          chapterId: href,
          sourceManga,
          langCode: "ES",
          chapNum,
          title: label,
        });
        index++;
      }
    }

    return chapters.reverse();
  }

  // ─── Chapter Details ─────────────────────────────────────────────────────────

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: [chapter.chapterId],
    };
  }
}

export const TomosMANGA = new TomosMANGAExtension();

// ─── Parsing Helpers ─────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "");
}

function extractId(url: string): string {
  if (!url.startsWith(BASE_URL)) return "";
  return url.replace(BASE_URL, "").replace(/^\/|\/$/g, "").split("?")[0] ?? "";
}

interface Entry {
  id: string;
  title: string;
  imageUrl: string;
}

function parseEntries(html: string): Entry[] {
  const entries: Entry[] = [];

  // Match each article block
  const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let articleMatch;

  while ((articleMatch = articleRegex.exec(html)) !== null) {
    const block = articleMatch[1] ?? "";

    // Get link from entry-title or first heading anchor
    const linkMatch = block.match(/class="[^"]*entry-title[^"]*"[^>]*>[\s\S]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      ?? block.match(/<h[23][^>]*>[\s\S]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

    if (!linkMatch) continue;

    const href = linkMatch[1] ?? "";
    const id = extractId(href);
    if (!id) continue;

    const title = stripTags(linkMatch[2] ?? "").trim();

    // Get image - prefer real src over lazy-load placeholder
    const imgMatch = block.match(/<img[^>]+src="([^"]*wp-content\/uploads[^"]+)"/i)
      ?? block.match(/<img[^>]+data-src="([^"]+)"/i)
      ?? block.match(/<img[^>]+src="([^"]+)"/i);
    const imageUrl = imgMatch?.[1] ?? "";

    entries.push({ id, title, imageUrl });
  }

  return entries;
}
