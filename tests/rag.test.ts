import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { rankChunks, searchMarkdownRag } from "@/lib/rag";

import { createTestBusiness, RAG_A, RAG_B, resetBusinessData } from "./helpers";

const OWNER_EMAIL = "rag-owner@sphinx.demo";

beforeAll(async () => {
  await resetBusinessData([RAG_A, RAG_B]);
  await createTestBusiness({ id: RAG_A, ownerEmail: OWNER_EMAIL, name: "Test CloudPulse CRM" });
  await createTestBusiness({ id: RAG_B, ownerEmail: OWNER_EMAIL, name: "Test Jaipur Smile" });

  await prisma.knowledgeChunk.createMany({
    data: [
      {
        id: "chk_test_a_01",
        businessId: RAG_A,
        chunkIndex: 1,
        section: "Products & Pricing",
        content:
          "The Pro Plan costs ₹1,499 per month for up to five users and includes WhatsApp invoicing and GST API access.",
        keywords: "pro,plan,pricing,invoicing,gst,users",
      },
      {
        id: "chk_test_a_02",
        businessId: RAG_A,
        chunkIndex: 2,
        section: "Refund & Cancellation Policy",
        content:
          "A full refund is available within 7 days of the initial subscription if fewer than 10 invoices were generated.",
        keywords: "refund,policy,days,invoices",
      },
      {
        id: "chk_test_b_01",
        businessId: RAG_B,
        chunkIndex: 1,
        section: "Products & Pricing",
        content:
          "Root Canal Treatment (RCT) costs ₹4,500 per tooth and normally requires two visits at the clinic.",
        keywords: "root,canal,treatment,tooth,clinic",
      },
      {
        id: "chk_test_b_02",
        businessId: RAG_B,
        chunkIndex: 2,
        section: "Support Hours",
        content:
          "The clinic is open Tuesday to Sunday from 10:00 AM to 8:00 PM and closed on Mondays.",
        keywords: "hours,clinic,monday,sunday",
      },
    ],
  });
});

afterAll(async () => {
  await resetBusinessData([RAG_A, RAG_B]);
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
});

describe("searchMarkdownRag tenant isolation", () => {
  it("Business A never retrieves Business B chunks", async () => {
    const results = await searchMarkdownRag(RAG_A, "Pro Plan price", 4);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.id.startsWith("chk_test_b_")).toBe(false);
    }
    expect(results[0].id).toBe("chk_test_a_01");
  });

  it("Business B never retrieves Business A chunks, even for a B-specific query", async () => {
    const results = await searchMarkdownRag(RAG_B, "root canal treatment cost", 4);
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.id.startsWith("chk_test_a_")).toBe(false);
    }
    expect(results[0].id).toBe("chk_test_b_01");
  });

  it("returns no foreign chunks when the query only matches the other tenant", async () => {
    const results = await searchMarkdownRag(RAG_A, "root canal tooth clinic", 4);
    expect(results.every((result) => result.id.startsWith("chk_test_a_"))).toBe(true);
    expect(results.some((result) => result.id === "chk_test_b_01")).toBe(false);
  });

  it("returns an empty list for an unknown business id", async () => {
    const results = await searchMarkdownRag("test_biz_that_does_not_exist", "pro plan", 4);
    expect(results).toEqual([]);
  });
});

describe("rankChunks", () => {
  const chunks = [
    {
      id: "chunk_pricing",
      section: "Products & Pricing",
      content: "The Pro Plan costs ₹1,499 per month.",
      keywords: "pro,plan,pricing",
    },
    {
      id: "chunk_hours",
      section: "Support Hours",
      content: "Support is open Monday to Saturday.",
      keywords: "hours,support",
    },
  ];

  it("respects topK", () => {
    const results = rankChunks(chunks, "pro plan pricing hours support", 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("chunk_pricing");
  });

  it("returns nothing for empty or stopword-only queries", () => {
    expect(rankChunks(chunks, "", 4)).toEqual([]);
    expect(rankChunks(chunks, "the and for", 4)).toEqual([]);
  });
});
