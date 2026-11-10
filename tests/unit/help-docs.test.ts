import { describe, it, expect } from "vitest";
import {
  getAllHelpArticles,
  getHelpArticleBySlug,
  searchHelpArticles,
  HELP_ARTICLES,
} from "../../src/server/domain/help/catalog";

describe("Task B6.5: User Help & In-App Task Guides", () => {
  describe("Catalog Completeness & Mandatory Task Guides", () => {
    it("loads all configured help articles", () => {
      const articles = getAllHelpArticles();
      expect(articles.length).toBeGreaterThanOrEqual(5);
      expect(articles.length).toBe(HELP_ARTICLES.length);
    });

    it("contains all 5 mandatory task guides specified in ROADMAP.md", () => {
      const mandatorySlugs = [
        "first-bill",
        "sales-returns",
        "stock-transfers",
        "gst-filing",
        "offline-mode",
      ];

      for (const slug of mandatorySlugs) {
        const article = getHelpArticleBySlug(slug);
        expect(article, `Missing mandatory guide: ${slug}`).toBeDefined();
        expect(article?.slug).toBe(slug);
        expect(article?.title).toBeTruthy();
        expect(article?.summary).toBeTruthy();
        expect(article?.steps.length).toBeGreaterThanOrEqual(3);
        expect(article?.readMinutes).toBeGreaterThan(0);
        expect(article?.targetRole).toBeTruthy();
      }
    });

    it("provides valid action routes and keyboard shortcuts", () => {
      const firstBill = getHelpArticleBySlug("first-bill");
      expect(firstBill).toBeDefined();
      expect(firstBill?.actionRoute).toBe("/dashboard/sales/pos");
      expect(firstBill?.steps.some((s) => s.shortcutKey === "F2")).toBe(true);

      const gstFiling = getHelpArticleBySlug("gst-filing");
      expect(gstFiling).toBeDefined();
      expect(gstFiling?.actionRoute).toBe("/dashboard/accounting/export");

      const offlineMode = getHelpArticleBySlug("offline-mode");
      expect(offlineMode).toBeDefined();
      expect(offlineMode?.category).toBe("offline");
    });
  });

  describe("Help Search & Category Indexing", () => {
    it("finds articles by keyword in title", () => {
      const results = searchHelpArticles("bill");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.slug === "first-bill")).toBe(true);
    });

    it("finds articles by keyword in tags or content", () => {
      const results = searchHelpArticles("fefo");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].slug).toBe("first-bill");

      const offlineResults = searchHelpArticles("sqlite");
      expect(offlineResults.some((r) => r.slug === "offline-mode")).toBe(true);
    });

    it("filters accurately by category", () => {
      const billingGuides = searchHelpArticles("", "billing");
      expect(billingGuides.length).toBeGreaterThanOrEqual(2);
      expect(billingGuides.every((g) => g.category === "billing")).toBe(true);

      const complianceGuides = searchHelpArticles("", "compliance");
      expect(complianceGuides.every((g) => g.category === "compliance")).toBe(true);
    });

    it("returns empty array for non-matching queries", () => {
      const nonExistent = searchHelpArticles("xyznonexistentterm999");
      expect(nonExistent).toHaveLength(0);
    });

    it("returns undefined for invalid slug lookup", () => {
      const invalid = getHelpArticleBySlug("invalid-slug-12345");
      expect(invalid).toBeUndefined();
    });
  });
});

