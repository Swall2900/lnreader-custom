"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

class MeioNovelCustom {
  constructor() {
    this.id = "meionovel-custom";
    this.name = "MeioNovel (Custom)";
    this.version = "1.0.3";
    this.icon = "src/id/meionovel/icon.png";
    this.site = "https://meionovels.com/";
  }

  _extractNovels(body) {
    const novels = [];
    const seen = new Set();

    const coverMap = {};
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]+alt=["']Cover\s+([^"']+)["']/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(body)) !== null) {
      coverMap[imgMatch[2].trim().toLowerCase()] = imgMatch[1];
    }

    const linkRegex = /<a[^>]+href=["'](https:\/\/meionovels\.com\/novel\/([^\/"']+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(body)) !== null) {
      const novelUrl = match[1].endsWith("/") ? match[1] : match[1] + "/";
      const cleanText = match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      if (
        cleanText &&
        cleanText.length > 1 &&
        !/^(mulai baca|detail|baca|lihat semua|selengkapnya)$/i.test(cleanText) &&
        !seen.has(novelUrl)
      ) {
        seen.add(novelUrl);
        novels.push({
          name: cleanText,
          cover: coverMap[cleanText.toLowerCase()] || "",
          path: novelUrl.replace(this.site, ""),
        });
      }
    }
    return novels;
  }

  async popularNovels(pageNo) {
    const url = pageNo > 1 ? `${this.site}jelajahi?page=${pageNo}` : `${this.site}jelajahi`;
    const result = await fetch(url);
    const body = await result.text();
    let novels = this._extractNovels(body);

    if (novels.length === 0) {
      const homeRes = await fetch(this.site);
      const homeBody = await homeRes.text();
      novels = this._extractNovels(homeBody);
    }
    return novels;
  }

  async parseNovel(novelPath) {
    const cleanPath = novelPath.replace(/^\/+/, "");
    const url = this.site + cleanPath;
    const result = await fetch(url);
    const body = await result.text();

    const titleMatch = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const name = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Untitled";

    const ogImgMatch = body.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const coverMatch = body.match(/<img[^>]+src=["'](https:\/\/meionovels\.com\/wp-content\/uploads\/[^"']+)["']/i);
    const cover = ogImgMatch ? ogImgMatch[1] : (coverMatch ? coverMatch[1] : "");

    const descMatch = body.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const summary = descMatch ? descMatch[1].trim() : "";

    const novel = {
      path: cleanPath,
      name,
      cover,
      summary,
      chapters: [],
    };

    const slug = cleanPath.replace(/^novel\//, "").replace(/\/+$/, "");
    const seen = new Set();

    // 1. Cek endpoint API dinamis dari x-data="chapterList(...)"
    let apiUrl = "";
    const xDataMatch = body.match(/chapterList\(([\s\S]*?)\)/i);
    if (xDataMatch) {
      const decoded = xDataMatch[1].replace(/&quot;/g, '"').replace(/\\\//g, "/");
      const urlInData = decoded.match(/https:\/\/meionovels\.com\/[^"'\s)]+/i);
      if (urlInData) apiUrl = urlInData[0];
    }
    if (!apiUrl) {
      apiUrl = `${this.site}novel/${slug}/chapters`;
    }

    try {
      const apiRes = await fetch(apiUrl, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      const apiText = await apiRes.text();
      const jsonData = JSON.parse(apiText);
      const list = Array.isArray(jsonData)
        ? jsonData
        : (jsonData.data || jsonData.chapters || jsonData.items || []);

      for (const item of list) {
        const rawUrl = item.url || item.link || (item.slug ? `${this.site}novel/${slug}/${item.slug}/` : "");
        const chapTitle = item.title || item.name || item.chapter_title || "";
        if (rawUrl && chapTitle && !seen.has(rawUrl)) {
          seen.add(rawUrl);
          novel.chapters.push({
            name: String(chapTitle).trim(),
            path: rawUrl.replace(this.site, ""),
          });
        }
      }
    } catch (e) {
      // Lanjut ke fallback HTML jika endpoint JSON berbeda
    }

    // 2. Fallback: ekstrak link bab dari HTML halaman jika API belum mengembalikan daftar
    if (novel.chapters.length === 0) {
      const chapRegex = new RegExp(
        `<a[^>]+href=["'](https:\\/\\/meionovels\\.com\\/novel\\/${slug}\\/[^"'#?]+)["'][^>]*>([\\s\\S]*?)<\\/a>`,
        "gi"
      );
      let match;
      while ((match = chapRegex.exec(body)) !== null) {
        const chapUrl = match[1];
        const chapName = match[2]
          .replace(/<[^>]+>/g, " ")
          .replace(/&#xFE0E;|▶|Mulai Baca\s*[—-]\s*/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (chapName && !seen.has(chapUrl)) {
          seen.add(chapUrl);
          novel.chapters.push({
            name: chapName,
            path: chapUrl.replace(this.site, ""),
          });
        }
      }
    }

    return novel;
  }

  async parseChapter(chapterPath) {
    const cleanPath = chapterPath.replace(/^\/+/, "");
    const url = this.site + cleanPath;
    const result = await fetch(url);
    const body = await result.text();

    const cleaned = body
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "");

    const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      return articleMatch[1];
    }

    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(cleaned)) !== null) {
      const text = pMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text.length > 0) {
        paragraphs.push(`<p>${pMatch[1]}</p>`);
      }
    }

    return paragraphs.length > 0 ? paragraphs.join("\n") : cleaned;
  }

  async searchNovels(searchTerm) {
    const url = `${this.site}jelajahi?q=${encodeURIComponent(searchTerm)}`;
    const result = await fetch(url);
    const body = await result.text();
    return this._extractNovels(body);
  }
}

exports.default = new MeioNovelCustom();
