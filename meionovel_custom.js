"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

class MeioNovelCustom {
  constructor() {
    this.id = "meionovel-custom";
    this.name = "MeioNovel (Custom)";
    this.version = "1.0.5";
    this.icon = "src/id/meionovel/icon.png";
    this.site = "https://meionovels.com/";
  }

  _extractSession(res, body) {
    const csrfMatch = body.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
    const csrf = csrfMatch ? csrfMatch[1] : "";
    let cookie = "";
    try {
      const rawSetCookie = res.headers && typeof res.headers.get === "function"
        ? res.headers.get("set-cookie")
        : "";
      if (rawSetCookie) {
        cookie = rawSetCookie
          .split(/,(?=\s*[^;=]+=[^;]+)/)
          .map((c) => c.split(";")[0].trim())
          .join("; ");
      }
    } catch (e) {}
    return { csrf, cookie };
  }

  _extractConfig(body, key) {
    const idx = body.indexOf(key + ":");
    if (idx === -1) return "";
    const sub = body.slice(idx + key.length + 1, idx + key.length + 600);
    const strMatch = sub.match(/^\s*['"]([^'"]+)['"]/);
    if (strMatch) return strMatch[1].replace(/\\\//g, "/");
    const numMatch = sub.match(/^\s*(\d+)/);
    return numMatch ? numMatch[1] : "";
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
    let { csrf, cookie } = this._extractSession(result, body);

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

    // Kumpulkan link bab dari HTML halaman novel terlebih dahulu
    const allLinksRegex = /<a[^>]+href=["'](https:\/\/meionovels\.com\/novel\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const fallbackChapters = [];
    let m;
    while ((m = allLinksRegex.exec(body)) !== null) {
      const linkUrl = m[1];
      if (linkUrl.startsWith(`${this.site}novel/${slug}/`) && linkUrl !== `${this.site}novel/${slug}/`) {
        const chapName = m[2]
          .replace(/<[^>]+>/g, " ")
          .replace(/&#xFE0E;|▶|Mulai Baca\s*[—-]\s*/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (chapName && !seen.has(linkUrl)) {
          seen.add(linkUrl);
          fallbackChapters.push({
            name: chapName,
            path: linkUrl.replace(this.site, ""),
          });
        }
      }
    }

    // Ambil listUrl, listToken, dan novelId (dari halaman novel atau halaman bab pertama)
    let listUrl = this._extractConfig(body, "listUrl") || `${this.site}baca/daftar`;
    let listToken = this._extractConfig(body, "listToken");
    let novelId = Number(this._extractConfig(body, "novelId")) || null;

    if (!listToken && fallbackChapters.length > 0) {
      try {
        const chapRes = await fetch(this.site + fallbackChapters[0].path);
        const chapHtml = await chapRes.text();
        const sess = this._extractSession(chapRes, chapHtml);
        if (sess.csrf) csrf = sess.csrf;
        if (sess.cookie) cookie = sess.cookie;
        listUrl = this._extractConfig(chapHtml, "listUrl") || listUrl;
        listToken = this._extractConfig(chapHtml, "listToken");
        novelId = Number(this._extractConfig(chapHtml, "novelId")) || novelId;
      } catch (e) {}
    }

    if (listToken) {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: url,
      };
      if (csrf) headers["X-CSRF-TOKEN"] = csrf;
      if (cookie) headers["Cookie"] = cookie;

      const payloads = [
        { token: listToken, novel_id: novelId },
        { listToken, novelId },
        { token: listToken },
      ];

      for (const payload of payloads) {
        if (novel.chapters.length > 0) break;
        try {
          const apiRes = await fetch(listUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });
          const apiText = await apiRes.text();
          const jsonData = JSON.parse(apiText);
          const list = Array.isArray(jsonData)
            ? jsonData
            : (jsonData.chapters || jsonData.data || jsonData.items || []);

          const apiSeen = new Set();
          for (const item of list) {
            const rawUrl = item.url || item.link || (item.slug ? `${this.site}novel/${slug}/${item.slug}/` : "");
            const chapTitle = item.title || item.name || item.label || item.chapter_title || "";
            if (rawUrl && chapTitle && !apiSeen.has(rawUrl)) {
              apiSeen.add(rawUrl);
              novel.chapters.push({
                name: String(chapTitle).trim(),
                path: rawUrl.replace(this.site, ""),
              });
            }
          }
        } catch (e) {}
      }
    }

    if (novel.chapters.length === 0) {
      novel.chapters = fallbackChapters;
    }

    return novel;
  }

  async parseChapter(chapterPath) {
    const cleanPath = chapterPath.replace(/^\/+/, "");
    const url = this.site + cleanPath;
    const result = await fetch(url);
    const body = await result.text();
    const { csrf, cookie } = this._extractSession(result, body);

    const contentUrl = this._extractConfig(body, "contentUrl") || `${this.site}baca/isi`;
    const contentToken = this._extractConfig(body, "contentToken");
    const chapterId = Number(this._extractConfig(body, "chapterId")) || null;

    if (contentToken) {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: url,
      };
      if (csrf) headers["X-CSRF-TOKEN"] = csrf;
      if (cookie) headers["Cookie"] = cookie;

      const payloads = [
        { token: contentToken, chapter_id: chapterId },
        { contentToken, chapterId },
        { token: contentToken },
      ];

      for (const payload of payloads) {
        try {
          const apiRes = await fetch(contentUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });
          const apiText = await apiRes.text();
          const jsonData = JSON.parse(apiText);
          const htmlContent =
            jsonData.content ||
            jsonData.html ||
            jsonData.body ||
            (jsonData.data && (jsonData.data.content || jsonData.data.html)) ||
            "";

          if (htmlContent && String(htmlContent).trim().length > 20) {
            return String(htmlContent);
          }
        } catch (e) {}
      }
    }

    return "<p>Gagal memuat isi chapter dari API Meionovel.</p>";
  }

  async searchNovels(searchTerm) {
    const url = `${this.site}jelajahi?q=${encodeURIComponent(searchTerm)}`;
    const result = await fetch(url);
    const body = await result.text();
    return this._extractNovels(body);
  }
}

exports.default = new MeioNovelCustom();
