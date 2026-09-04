#!/usr/bin/env node
// A stand-in for a real check. It prints what a check prints - a human line per
// assertion - and, next to each one, the size of the set that assertion covered.
//
// Environment knobs exist so the CLI tests can move a scope without editing a
// file: DENOM_FIXTURE_ROUTES, DENOM_FIXTURE_FILES, DENOM_FIXTURE_DROP,
// DENOM_FIXTURE_EXIT, DENOM_FIXTURE_MALFORMED.
import { declare } from "../../src/index.mjs";

const routes = Number(process.env.DENOM_FIXTURE_ROUTES ?? 7);
const files = Number(process.env.DENOM_FIXTURE_FILES ?? 12);
const drop = process.env.DENOM_FIXTURE_DROP === "1";

console.log("PASS  every route answers");
console.log(declare("every route answers", routes));

if (!drop) {
  console.log("PASS  no em or en dash in maintained copy");
  console.log(declare("no em or en dash in maintained copy", files));
}

if (process.env.DENOM_FIXTURE_MALFORMED === "1") {
  console.log("denominator: trailing prose n=3 (all clean)");
}

process.exit(Number(process.env.DENOM_FIXTURE_EXIT ?? 0));
