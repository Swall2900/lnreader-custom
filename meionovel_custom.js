const { fetchApi } = require("@libs/fetch");
const { load: loadCheerio } = require("cheerio");

class MeioNovelCustom {
  constructor() {
    this.id = "meionovel-custom";
    this.name = "MeioNovel (Custom)";
    this.version = "1.0.0";
    this.icon = "src/id/meionovel/icon.png";
    this.site = "https://meionovels.com/";
  }

  async popularNovels(pageNo) {
    const url = `${this.site}novel/?page=${pageNo}`;
    const result = await fetchApi(url);
    const body = await result.text();
    const $ = loadCheerio(body);

    const novels = [];
    $("article, .novel-item, .bsx").each((i, el) => {
      const name = $(el).find("h2, h3, .tt").text().trim();
      const cover = $(el).find("img").attr("src");
      const novelUrl = $(el).find("a").attr("href");

      if (name && novelUrl) {
        novels.push({
          name,
          cover,
          path: novelUrl.replace(this.site, ""),
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath) {
    const url = this.site + novelPath;
    const result = await fetchApi(url);
    const body = await result.text();
    const $ = loadCheerio(body);

    const novel = {
      path: novelPath,
      name: $("h1").first().text().trim() || "Untitled",
      cover: $("img").first().attr("src"),
      summary: $(".summary, .description, p").first().text().trim(),
      chapters: [],
    };

    $("a[href*='chapter']").each((i, el) => {
      const chapterName = $(el).text().trim();
      const chapterUrl = $(el).attr("href");
      if (chapterName && chapterUrl) {
        novel.chapters.push({
          name: chapterName,
          path: chapterUrl.replace(this.site, ""),
        });
      }
    });

    return novel;
  }

  async parseChapter(chapterPath) {
    const url = this.site + chapterPath;
    const result = await fetchApi(url);
    const body = await result.text();
    const $ = loadCheerio(body);

    return $(".chapter-content, .entry-content, article").html() || "";
  }

  async searchNovels(searchTerm) {
    const url = `${this.site}?s=${encodeURIComponent(searchTerm)}`;
    const result = await fetchApi(url);
    const body = await result.text();
    const $ = loadCheerio(body);

    const novels = [];
    $("article, .novel-item, .bsx").each((i, el) => {
      const name = $(el).find("h2, h3, .tt").text().trim();
      const cover = $(el).find("img").attr("src");
      const novelUrl = $(el).find("a").attr("href");

      if (name && novelUrl) {
        novels.push({
          name,
          cover,
          path: novelUrl.replace(this.site, ""),
        });
      }
    });

    return novels;
  }
}

module.exports = new MeioNovelCustom();
