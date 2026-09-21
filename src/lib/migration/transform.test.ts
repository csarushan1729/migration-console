import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalizeEmployeeNumber, cleanPhone, cleanValue } from "./transform.ts";

describe("canonicalizeEmployeeNumber", () => {
  it("strips the client's APX- prefix and uppercases", () => {
    assert.equal(canonicalizeEmployeeNumber("apx-1001"), "1001");
    assert.equal(canonicalizeEmployeeNumber("APX_1001"), "1001");
  });

  it("leaves a plain numeric id unchanged", () => {
    assert.equal(canonicalizeEmployeeNumber("1001"), "1001");
  });
});

describe("cleanPhone", () => {
  it("formats a 10-digit Indian mobile as E.164", () => {
    assert.equal(cleanPhone("9876543210"), "+919876543210");
  });

  it("strips a leading 91 country code before re-adding it", () => {
    assert.equal(cleanPhone("919876543210"), "+919876543210");
  });

  it("strips spaces and a leading 0 from a local number", () => {
    assert.equal(cleanPhone("+91 98765 43210"), "+919876543210");
  });

  it("returns null for something too short to be a phone number", () => {
    assert.equal(cleanPhone("12345"), null);
  });
});

describe("cleanValue — employeeNumber and names", () => {
  it("canonicalizes an employee number and reports high confidence", () => {
    const r = cleanValue("employeeNumber", "APX-1001");
    assert.equal(r.value, "1001");
    assert.ok(r.confidence > 0.9);
  });

  it("title-cases a first name", () => {
    const r = cleanValue("firstName", "RAJESH");
    assert.equal(r.value, "Rajesh");
  });

  it("treats an empty value as blank with full confidence", () => {
    const r = cleanValue("firstName", "");
    assert.equal(r.value, null);
    assert.equal(r.confidence, 1);
  });
});

describe("cleanValue — email", () => {
  it("lowercases a valid corporate email", () => {
    const r = cleanValue("email", "Rajesh.Kumar@ApexMfg.in");
    assert.equal(r.value, "rajesh.kumar@apexmfg.in");
    assert.equal(r.issue, undefined);
  });

  it("flags a personal-domain email instead of silently accepting it", () => {
    const r = cleanValue("email", "vikram.s@gmail.com");
    assert.equal(r.issue, "personal_email");
  });

  it("flags text that isn't email-shaped as invalid", () => {
    const r = cleanValue("email", "not an email");
    assert.equal(r.issue, "invalid");
  });
});

describe("cleanValue — dates", () => {
  it("passes through a clean ISO date", () => {
    const r = cleanValue("dateOfJoining", "2019-08-01");
    assert.equal(r.value, "2019-08-01");
    assert.equal(r.issue, undefined);
  });

  it("flags a locale-ambiguous date rather than guessing", () => {
    const r = cleanValue("dateOfBirth", "05/06/1991");
    assert.equal(r.value, null);
    assert.equal(r.issue, "ambiguous_date");
  });
});

describe("cleanValue — enums", () => {
  it("maps known client vocabulary to the target enum", () => {
    const r = cleanValue("employmentType", "Permanent");
    assert.equal(r.value, "full_time");
  });

  it("accepts an exact enum value case-insensitively", () => {
    const r = cleanValue("status", "ACTIVE");
    assert.equal(r.value, "active");
  });

  it("flags a token outside the closed enum instead of guessing", () => {
    const r = cleanValue("status", "Absconding");
    assert.equal(r.issue, "unknown_enum");
  });
});

describe("cleanValue — PAN and numbers", () => {
  it("uppercases a well-formed PAN", () => {
    const r = cleanValue("panNumber", "abcde1234f");
    assert.equal(r.value, "ABCDE1234F");
    assert.equal(r.issue, undefined);
  });

  it("flags a PAN that fails the pattern", () => {
    const r = cleanValue("panNumber", "12345");
    assert.equal(r.issue, "invalid");
  });

  it("parses a currency-formatted CTC into a plain number", () => {
    const r = cleanValue("ctcAnnual", "₹9,80,000");
    assert.equal(r.value, 980000);
  });
});
