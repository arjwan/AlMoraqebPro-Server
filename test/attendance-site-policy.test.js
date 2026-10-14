'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeAttendanceSite } = require('../services/attendance-site-policy');
const sites = [
  { id: 'hq', companyId: 'A', active: true, latitude: 33.3, longitude: 44.4, radiusMeters: 150 },
  { id: 'warehouse', companyId: 'A', active: true, latitude: 33.31, longitude: 44.41, radiusMeters: 150 },
  { id: 'other', companyId: 'B', active: true, latitude: 33.3, longitude: 44.4, radiusMeters: 150 }
];
const employee = { companyId: 'A', locationId: 'hq', allowedSiteIds: ['warehouse', 'other'] };
const point = (latitude, longitude, accuracyMeters = 10) => ({ latitude, longitude, accuracyMeters });
const check = (e, p, extra = {}) => authorizeAttendanceSite({ employee: e, companyId: 'A', sites, point: p, ...extra });
test('primary site allowed', () => assert.equal(check(employee, point(33.3, 44.4)).siteId, 'hq'));
test('authorized warehouse allowed', () => assert.equal(check(employee, point(33.31, 44.41)).siteId, 'warehouse'));
test('other company site never authorized', () => assert.equal(check({ ...employee, locationId: 'other', allowedSiteIds: [] }, point(33.3, 44.4)).allowed, false));
test('unassigned warehouse rejected', () => assert.equal(check({ ...employee, allowedSiteIds: [] }, point(33.31, 44.41)).allowed, false));
test('outside all sites rejected', () => assert.equal(check(employee, point(33.4, 44.5)).allowed, false));
test('poor accuracy rejected', () => assert.equal(check(employee, point(33.3, 44.4, 500)).reason, 'insufficient_accuracy'));
test('company mismatch rejected', () => assert.equal(check({ ...employee, companyId: 'B' }, point(33.3, 44.4)).reason, 'company_mismatch'));
test('temporary grant expires', () => {
 const e = { companyId: 'A', locationId: 'hq', temporarySiteGrants: [{ siteId: 'warehouse', from: '2026-10-01', until: '2026-10-02' }] };
 assert.equal(check(e, point(33.31, 44.41), { now: new Date('2026-10-03') }).allowed, false);
 assert.equal(check(e, point(33.31, 44.41), { now: new Date('2026-10-01T12:00:00Z') }).allowed, true);
});
