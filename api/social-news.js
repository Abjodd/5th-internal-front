export default async function handler(req, res) {
  try {
    const apiKey = process.env.GNEWS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GNEWS_API_KEY is not configured",
      });
    }

    const query = encodeURIComponent(
      "Instagram OR TikTok OR YouTube OR Facebook OR Meta OR LinkedIn OR Threads OR Snapchat OR influencer OR creator economy OR social media"
    );

    const url =
      `https://gnews.io/api/v4/search` +
      `?q=${query}` +
      `&lang=en` +
      `&country=in` +
      `&max=10` +
      `&sortby=publishedAt` +
      `&apikey=${apiKey}`;

    const response = await fetch(url);

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.errors?.join(", ") ||
          data?.message ||
          "GNews request failed",
      });
    }

    const articles = Array.isArray(data.articles)
      ? data.articles
      : [];

    // Extra filtering so the feed stays SOCIAL MEDIA ONLY.
    const keywords = [
      "instagram",
      "tiktok",
      "youtube",
      "facebook",
      "meta",
      "linkedin",
      "threads",
      "snapchat",
      "social media",
      "social platform",
      "social network",
      "creator",
      "influencer",
      "reels",
      "shorts",
      "social commerce",
      "social advertising",
    ];

    const filtered = articles.filter((article) => {
      const text = [
        article.title,
        article.description,
        article.content,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return keywords.some((keyword) =>
        text.includes(keyword)
      );
    });

    return res.status(200).json({
      articles: filtered,
    });
  } catch (error) {
    console.error("SOCIAL NEWS API ERROR:", error);

    return res.status(500).json({
      error: "Failed to fetch social news",
    });
  }
}