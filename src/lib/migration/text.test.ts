import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBlank,
  looksEmail,
  looksPhone,
  normalizeHeader,
  parseNumberLoose,
  similarity,
  splitPersonName,
  titleCaseName,
} from "./text.ts";

describe("normalizeHeader", () => {
  it("lowercases, collapses punctuation, and trims", () => {
    assert.equal(normalizeHeader("  Emp_Code  "), "emp code");
    assert.equal(normalizeHeader("Cost/Center"), "cost center");
    assert.equal(normalizeHeader("R&D Dept."), "r and d dept");
  });
});

describe("similarity", () => {
  it("is 1 for an exact match after normalization", () => {
    assert.equal(similarity("Employee Number", "employee number"), 1);
  });

  it("is 0 when either side is empty", () => {
    assert.equal(similarity("", "employee number"), 0);
  });

  it("is lower for less similar strings than for near-identical ones", () => {
    const close = similarity("employee no", "employee number");
    const far = similarity("employee no", "pay date");
    assert.ok(close > far);
  });
});

describe("titleCaseName", () => {
  it("title-cases an ALL CAPS name", () => {
    assert.equal(titleCaseName("RAJESH KUMAR"), "Rajesh Kumar");
  });

  it("lowercases name particles like van/de/bin", () => {
    assert.equal(titleCaseName("ludwig van beethoven"), "Ludwig van Beethoven");
  });

  it("preserves initials such as J.R.", () => {
    assert.equal(titleCaseName("j.r. tolkien"), "J.R. Tolkien");
  });
});

describe("splitPersonName", () => {
  it("splits 'Last, First' comma order", () => {
    const parts = splitPersonName("Nair, Arun");
    assert.deepEqual(parts, { firstName: "Arun", lastName: "Nair" });
  });

  it("splits space-separated names by taking the last token as the surname", () => {
    const parts = splitPersonName("Rajesh Kumar");
    assert.deepEqual(parts, { firstName: "Rajesh", lastName: "Kumar" });
  });

  it("strips a leading honorific before splitting", () => {
    const parts = splitPersonName("Dr. Arun Nair");
    assert.deepEqual(parts, { firstName: "Arun", lastName: "Nair" });
  });

  it("returns an empty last name for a single-word name", () => {
    const parts = splitPersonName("Pooja");
    assert.deepEqual(parts, { firstName: "Pooja", lastName: "" });
  });
});

describe("isBlank", () => {
  it("treats N/A, dashes, and null-ish strings as blank", () => {
    for (const v of ["", "  ", "-", "N/A", "n/a", "null", "NULL"]) {
      assert.equal(isBlank(v), true, `expected "${v}" to be blank`);
    }
  });

  it("does not treat a real value as blank", () => {
    assert.equal(isBlank("Pune Plant"), false);
  });
});

describe("parseNumberLoose", () => {
  it("strips currency symbols and thousands separators", () => {
    assert.equal(parseNumberLoose("₹9,80,000"), 980000);
    assert.equal(parseNumberLoose("$1,200.50"), 1200.5);
  });

  it("returns null for non-numeric text", () => {
    assert.equal(parseNumberLoose("n/a"), null);
  });
});

describe("looksEmail / looksPhone", () => {
  it("recognises a plausible email address", () => {
    assert.equal(looksEmail("rajesh.kumar@apexmfg.in"), true);
    assert.equal(looksEmail("not an email"), false);
  });

  it("recognises a plausible phone number by digit count", () => {
    assert.equal(looksPhone("+91 98765 43210"), true);
    assert.equal(looksPhone("12"), false);
  });
});
