"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

class MeioNovelCustom {
  constructor() {
    this.id = "meionovel-custom";
    this.name = "MeioNovel (Custom)";
    this.version = "1.0.4";
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

  _extractConfigField(body, key) {
    const regex = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`, "i");
    const match = body.match(regex);
    return match ? match[1].replace(/\\\//g, "/") : "";
  }

  _extractNumberField(body, key) {
    const regex = new RegExp(`${key}\\s*:\\s*(\\d+)`, "i");
    const match = body.match(regex);
    return match ? Number(match[1]) : null;
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
    const { csrf, cookie } = this._extractSession(result, body);

    const titleMatch = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const name
