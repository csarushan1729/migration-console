import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDateStrict } from "./dates.ts";

describe("parseDateStrict — numeric dates", () => {
  it("flags 05/06/1991 as an ambiguous DMY/MDY locale trap", () => {
    const r = parseDateStrict("05/06/1991");
    assert.equal(r.status, "ambiguous");
    if (r.status === "ambiguous") {
      assert.deepEqual(r.candidates.sort(), ["1991-05-06", "1991-06-05"].sort());
    }
  });

  it("accepts day > 12 as unambiguous DMY", () => {
    const r = parseDateStrict("21/03/1988");
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.iso, "1988-03-21");
  });

  it("accepts second part > 12 as unambiguous MDY", () => {
    const r = parseDateStrict("03/21/1988");
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.iso, "1988-03-21");
  });

  it("expands two-digit years using the 30-cutover rule", () => {
    const old = parseDateStrict("15/06/70");
    const recent = parseDateStrict("15/06/10");
    assert.equal(old.status, "ok");
    assert.equal(recent.status, "ok");
    if (old.status === "ok") assert.equal(old.iso, "1970-06-15");
    if (recent.status === "ok") assert.equal(recent.iso, "2010-06-15");
  });

  it("rejects a numeric date that isn't a real calendar day", () => {
    const r = parseDateStrict("31/02/2020");
    assert.equal(r.status, "invalid");
  });
});

describe("parseDateStrict — ISO and named-month formats", () => {
  it("accepts a plain ISO date", () => {
    const r = parseDateStrict("2019-08-01");
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.iso, "2019-08-01");
  });

  it("rejects an ISO-shaped date that isn't a real calendar day", () => {
    const r = parseDateStrict("2021-02-30");
    assert.equal(r.status, "invalid");
  });

  it("parses day-month-name-year (15-Jun-2014)", () => {
    const r = parseDateStrict("15-Jun-2014");
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.iso, "2014-06-15");
  });

  it("parses month-name day, year (Jun 15, 2014)", () => {
    const r = parseDateStrict("Jun 15, 2014");
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.iso, "2014-06-15");
  });
});

describe("parseDateStrict — edge inputs", () => {
  it("treats an empty string as empty, not invalid", () => {
    assert.equal(parseDateStrict("").status, "empty");
    assert.equal(parseDateStrict("   ").status, "empty");
  });

  it("rejects unrecognisable garbage", () => {
    const r = parseDateStrict("not-a-date");
    assert.equal(r.status, "invalid");
  });
});
