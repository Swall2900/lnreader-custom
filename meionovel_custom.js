"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

class MeioNovelCustom {
  constructor() {
    this.id = "meionovel-custom";
    this.name = "MeioNovel (Custom)";
    this.version = "1.1.0";
    this.icon = "src/id/meionovel/icon.png";
    this.site = "https://meionovels.com/";
  }

  _decodeEntities(str) {
    return String(str)
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&#039;|&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\\+\//g, "/");
  }

  _b64ToBytes(b64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = String(b64).replace(/[^A-Za-z0-9+/=]/g, "");
    const out = [];
    for (let i = 0; i < clean.length; i += 4) {
      const c1 = chars.indexOf(clean[i]);
      const c2 = chars.indexOf(clean[i + 1]);
      const c3 = clean[i + 2] === "=" ? 0 : chars.indexOf(clean[i + 2]);
      const c4 = clean[i + 3] === "=" ? 0 : chars.indexOf(clean[i + 3]);
      if (c1 < 0 || c2 < 0) continue;
      const n = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
      out.push((n >> 16) & 255);
      if (clean[i + 2] !== "=" && c3 >= 0) out.push((n >> 8) & 255);
      if (clean[i + 3] !== "=" && c4 >= 0) out.push(n & 255);
    }
    return out;
  }

  _utf8BytesToString(bytes) {
    let str = "";
    let i = 0;
    while (i < bytes.length) {
      const b1 = bytes[i++];
      if (b1 < 0x80) {
        str += String.fromCharCode(b1);
      } else if (b1 >= 0xc0 && b1 < 0xe0) {
        const b2 = bytes[i++];
        str += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      } else if (b1 >= 0xe0 && b1 < 0xf0) {
        const b2 = bytes[i++];
        const b3 = bytes[i++];
        str += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      } else {
        const b2 = bytes[i++];
        const b3 = bytes[i++];
        const b4 = bytes[i++];
        let cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
        cp -= 0x10000;
        str += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      }
    }
    return str;
  }

  _decodeChapterPayload(data) {
    if (!data || !data.k || !Array.isArray(data.p)) return "";
    const keyBytes = this._b64ToBytes(data.k);
    if (keyBytes.length === 0) return "";

    const sorted = [...data.p].sort((a, b) => a[0] - b[0]);
    const parts = [];

    for (const entry of sorted) {
      const offset = Number(entry[0]) || 0;
      const encBytes = this._b64ToBytes(entry[1]);
      for (let a = 0; a < encBytes.length; a++) {
        encBytes[a] ^= keyBytes[(a + offset) % keyBytes.length];
      }
      parts.push(this._utf8BytesToString(encBytes));
    }
    return parts.join("");
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

  _extractBlockField(block, key) {
    const decoded = this._decodeEntities(block);
    const regex = new RegExp(`["']?${key}["']?\\s*:\\s*(?:["']([^"']+)["']|(\\d+))`, "i");
    const match = decoded.match(regex);
    if (!match) return "";
    return match[1] !== undefined ? match[1] : match[2];
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

  _parseChaptersFromHtml(html, slug, seen, targetList) {
    let added = 0;
    const linkRegex = /<a[^>]+href=["'](https:\/\/meionovels\.com\/novel\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const linkUrl = m[1];
      if (linkUrl.startsWith(`${this.site}novel/${slug}/`) && linkUrl !== `${this.site}novel/${slug}/`) {
        const chapName = m[2]
          .replace(/<[^>]+>/g, " ")
          .replace(/&#xFE0E;|▶|Mulai Baca\s*[—-]\s*/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (chapName && !seen.has(linkUrl)) {
          seen.add(linkUrl);
          targetList.push({
            name: chapName,
            path: linkUrl.replace(this.site, ""),
          });
          added++;
        }
      }
    }
    return added;
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
    const { csrf, cookie } = this._extractSession(result, body);

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

    let listUrl = `${this.site}baca/daftar`;
    let novelId = null;
    let token = "";

    const clIdx = body.indexOf("chapterList(");
    if (clIdx !== -1) {
      const clBlock = body.slice(clIdx, clIdx + 2500);
      listUrl = this._extractBlockField(clBlock, "url") || listUrl;
      novelId = Number(this._extractBlockField(clBlock, "novel")) || null;
      token = this._extractBlockField(clBlock, "token");
    }

    if (token && novelId) {
      const firstRes = await this._postJson(
        listUrl,
        { novel: novelId, token, params: {} },
        csrf,
        cookie,
        url
      );
      const firstHtml = firstRes.data && firstRes.data.html ? String(firstRes.data.html) : "";

      if (firstHtml) {
        this._parseChaptersFromHtml(firstHtml, slug, seen, novel.chapters);

        // Deteksi parameter jalur/tab (misal Web Novel / Light Novel)
        const jalurMatches = [...firstHtml.matchAll(/[?&]jalur=([^"'&\s#]+)/gi)].map((x) =>
          decodeURIComponent(x[1])
        );
        const uniqueJalurs = [...new Set(jalurMatches)];

        // Deteksi jumlah halaman pagination (?page=2, ?page=3, ...)
        let maxPage = 1;
        const pageMatches = firstHtml.matchAll(/[?&]page=(\d+)/gi);
        for (const pm of pageMatches) {
          const pNum = Number(pm[1]);
