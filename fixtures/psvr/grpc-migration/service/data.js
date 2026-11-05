"use strict";

/**
 * The site-reading source of truth for the fixture service.
 *
 * The values are fixed so a migration can be compared byte-for-byte with the REST baseline. `atMs`
 * is an explicit epoch millisecond: the wire contract must carry it without a locale or timezone
 * dependency.
 */
const SITES = Object.freeze({
  "site-a": Object.freeze([
    { siteId: "site-a", watts: 4120, atMs: 1762300000000 },
    { siteId: "site-a", watts: 4185, atMs: 1762300060000 },
    { siteId: "site-a", watts: 4090, atMs: 1762300120000 },
    { siteId: "site-a", watts: 4210, atMs: 1762300180000 },
    { siteId: "site-a", watts: 4150, atMs: 1762300240000 },
    { siteId: "site-a", watts: 3970, atMs: 1762300300000 },
  ]),
  "site-b": Object.freeze([
    { siteId: "site-b", watts: 2210, atMs: 1762300000000 },
    { siteId: "site-b", watts: 2275, atMs: 1762300060000 },
    { siteId: "site-b", watts: 2180, atMs: 1762300120000 },
  ]),
});

function readingsFor(siteId) {
  const readings = SITES[siteId];
  return readings === undefined ? null : readings.map((reading) => ({ ...reading }));
}

function readingFor(siteId) {
  const readings = readingsFor(siteId);
  return readings === null ? null : readings[0];
}

module.exports = { SITES, readingFor, readingsFor };
