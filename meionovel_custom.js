"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

class MeioNovelCustom {
  constructor() {
    this.id = "meionovel-custom";
    this.name = "MeioNovel (Custom)";
    this.version = "1.0.1";
    this.icon = "src/id/meionovel/icon.png";
    this.site = "https://meionovels.com/";
  }

  async popularNovels(pageNo) {
    const url = `${this.site}novel/?page=${pageNo}`;
    const result = await fetch(url);
    const body = await result.text();
    const novels = [];

    const regex = /<a[^>]+href=["'](https:\/\/meionovels\.com\/novel\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const seen = new Set();

    while ((match = regex.exec(body)) !== null) {
      const novelUrl = match[1];
      const innerHtml = match[2];
      const titleMatch = innerHtml.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i) || innerHtml.match(/title=["']([^"']+)["']/i);
      const imgMatch = innerHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
      const name = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      if (name && !seen.has(novelUrl)) {
        seen.add(novelUrl);
        novels.push({
          name,
          cover: imgMatch ? imgMatch[1] : "",
          path: novelUrl.replace(this.site, ""),
        });
      }
    }
    return novels;
  }

  async parseNovel(novelPath) {
    const url = this.site + novelPath;
    const result = await fetch(url);
    const body = await result.text();

    const titleMatch = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const name = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Untitled";

    const novel = {
      path: novelPath,
      name,
      cover: "",
      summary: "",
      chapters: [],
    };

    const chapRegex = /<a[^>]+href=["'](https:\/\/meionovels\.com\/[^"']*chapter[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const seen = new Set();

    while ((match = chapRegex.exec(body)) !== null) {
      const chapUrl = match[1];
      const chapName = match[2].replace(/<[^>]+>/g, "").trim();
      if (chapName && !seen.has(chapUrl)) {
        seen.add(chapUrl);
        novel.chapters.push({
          name: chapName,
          path: chapUrl.replace(this.site, ""),
        });
      }
    }
    return novel;
  }

  async parseChapter(chapterPath) {
    const url = this.site + chapterPath;
    const result = await fetch(url);
    const body = await result.text();

    const contentMatch = body.match(/<div[^>]+class=["'][^"']*(?:chapter-content|entry-content|reading-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    return contentMatch ? contentMatch[1] : body;
  }

  async searchNovels(searchTerm) {
    const url = `${this.site}?s=${encodeURIComponent(searchTerm)}`;
    const result = await fetch(url);
    const body = await result.text();
    const novels = [];

    const regex = /<a[^>]+href=["'](https:\/\/meionovels\.com\/novel\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const seen = new Set();

    while ((match = regex.exec(body)) !== null) {
      const novelUrl = match[1];
      const innerHtml = match[2];
      const titleMatch = innerHtml.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/i) || innerHtml.match(/title=["']([^"']+)["']/i);
      const imgMatch = innerHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
      const name = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      if (name && !seen.has(novelUrl)) {
        seen.add(novelUrl);
        novels.push({
          name,
          cover: imgMatch ? imgMatch[1] : "",
          path: novelUrl.replace(this.site, ""),
        });
      }
    }
    return novels;
  }
}

exports.default = new MeioNovelCustom();
