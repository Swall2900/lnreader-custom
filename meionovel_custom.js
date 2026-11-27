"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

class MeioNovelCustom {
  constructor() {
    this.id = "meionovel-custom";
    this.name = "MeioNovel (Custom)";
    this.version = "1.0.6";
    this.icon = "src/id/meionovel/icon.png";
    this.site = "https://meionovels.com/";
  }

  _extractSession(res, body) {
    const csrfMatch = body.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
    let csrf = csrfMatch ? csrfMatch[1] : "";
    const cookieJar = {};

    try {
      if (res && res.headers) {
        let rawCookies = [];
        if (typeof res.headers.getSetCookie === "function") {
          rawCookies = res.headers.getSetCookie();
        } else if (typeof res.headers.forEach === "function") {
          res.headers.forEach((val, key) => {
            if (String(key).toLowerCase() === "set-cookie") {
              rawCookies.push(val);
            }
          });
        } else if (typeof res.headers.get === "function") {
          const single = res.headers.get("set-cookie");
          if (single) rawCookies.push(single);
        }

        for (const entry of rawCookies) {
          const parts = String(entry).split(/,(?=\s*[^;=]+=[^;]+)/);
          for (const p of parts) {
            const pair = p.split(";")[0].trim();
            const eqIdx = pair.indexOf("=");
            if (eqIdx > 0) {
              const k = pair.slice(0, eqIdx).trim();
              const v = pair.slice(eqIdx + 1).trim();
              cookieJar[k] = v;
              if (!csrf && k === "XSRF-TOKEN") {
                try {
                  csrf = decodeURIComponent(v);
                } catch (e) {}
              }
            }
          }
        }
      }
    } catch (e) {}

    const cookie = Object.keys(cookieJar)
      .map((k) => `${k}=${cookieJar[k]}`)
      .join("; ");

    return { csrf, cookie };
  }

  _extractConfig(body, key) {
    const idx = body.indexOf(key + ":");
    if (idx === -1) return "";
    const sub = body.slice(idx + key.length + 1, idx + key.length + 700);
    const strMatch = sub.match(/^\s*['"]([^'"]+)['"]/);
    if (strMatch) return strMatch[1].replace(/\\\//g, "/");
    const numMatch = sub.match(/^\s*(\d+)/);
    return numMatch ? numMatch[1] : "";
  }

  async _postJson(endpoint, payload, csrf, cookie, referer) {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://meionovels.com",
      Referer: referer,
    };
    if (csrf) headers["X-CSRF-TOKEN"] = csrf;
    if (cookie) headers["Cookie"] = cookie;

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (e) {}
    return { ok: res.ok, status: res.status, data, raw: text };
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

    // Kumpulkan link bab dari halaman detail novel
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

    let listUrl = this._extractConfig(body, "listUrl") || `${this.site}baca/daftar`;
    let listToken = this._extractConfig(body, "listToken");
    let novelId = Number(this._extractConfig(body, "novelId")) || null;
    let chapterId = Number(this._extractConfig(body, "chapterId")) || null;
    let refererUrl = url;

    // Jika halaman novel tidak memuat listToken langsung, ambil dari halaman bab pertama
    if (!listToken && fallbackChapters.length > 0) {
      refererUrl = this.site + fallbackChapters[0].path;
      const chapRes = await fetch(refererUrl);
      const chapHtml = await chapRes.text();
      const sess = this._extractSession(chapRes, chapHtml);
      if (sess.csrf) csrf = sess.csrf;
      if (sess.cookie) cookie = sess.cookie;
      listUrl = this._extractConfig(chapHtml, "listUrl") || listUrl;
      listToken = this._extractConfig(chapHtml, "listToken");
      novelId = Number(this._extractConfig(chapHtml, "novelId")) || novelId;
      chapterId = Number(this._extractConfig(chapHtml, "chapterId")) || chapterId;
    }

    if (listToken) {
      const payload = { novel: novelId, token: listToken };
      if (chapterId) payload.chapter = chapterId;

      const apiRes = await this._postJson(listUrl, payload, csrf, cookie, refererUrl);
      const tocHtml = apiRes.data && apiRes.data.html ? String(apiRes.data.html) : "";

      if (tocHtml) {
        const tocLinkRegex = /<a[^>]+href=["'](https:\/\/meionovels\.com\/novel\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        const tocSeen = new Set();
        let tm;
        while ((tm = tocLinkRegex.exec(tocHtml)) !== null) {
          const cUrl = tm[1];
          const cName = tm[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (cName && !tocSeen.has(cUrl)) {
            tocSeen.add(cUrl);
            novel.chapters.push({
              name: cName,
              path: cUrl.replace(this.site, ""),
            });
          }
        }
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
      const apiRes = await this._postJson(
        contentUrl,
        { chapter: chapterId, token: contentToken },
        csrf,
        cookie,
        url
      );

      const d = apiRes.data || {};
      if (typeof d === "string" && d.length > 20) return d;
      if (d.html) return String(d.html);
      if (d.content) return String(d.content);
      if (Array.isArray(d.paragraphs)) {
        return d.paragraphs.map((p) => `<p>${p}</p>`).join("\n");
      }

      return `<p>Gagal memuat (HTTP ${apiRes.status}): ${apiRes.raw.slice(0, 200)}</p>`;
    }

    return "<p>Token chapter tidak ditemukan di halaman.</p>";
  }

  async searchNovels(searchTerm) {
    const url = `${this.site}jelajahi?q=${encodeURIComponent(searchTerm)}`;
    const result = await fetch(url);
    const body = await result.text();
    return this._extractNovels(body);
  }
}

exports.default = new MeioNovelCustom();
