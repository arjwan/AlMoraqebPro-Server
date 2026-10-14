'use strict';

/**
 * Pure, server-side attendance site authorization policy.
 * This module must be invoked by the authenticated attendance endpoint;
 * never trust employeeId, companyId or permitted sites supplied by a device.
 */
function normalizeId(value) { return String(value == null ? '' : value).trim(); }
function finiteCoordinate(value, low, high) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(number) && number >= low && number <= high ? number : null;
}
function distanceMeters(a, b) {
  const lat1 = finiteCoordinate(a.latitude, -90, 90);
  const lon1 = finiteCoordinate(a.longitude, -180, 180);
  const lat2 = finiteCoordinate(b.latitude, -90, 90);
  const lon2 = finiteCoordinate(b.longitude, -180, 180);
  if ([lat1, lon1, lat2, lon2].some(v => v === null)) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function authorizeAttendanceSite({ employee, companyId, sites, point, now = new Date(), maxAccuracyMeters = 100 }) {
  if (!employee || !companyId || normalizeId(employee.companyId) !== normalizeId(companyId)) return { allowed: false, reason: 'company_mismatch' };
  if (!point || finiteCoordinate(point.latitude, -90, 90) === null || finiteCoordinate(point.longitude, -180, 180) === null) return { allowed: false, reason: 'invalid_location' };
  const accuracy = Number(point.accuracyMeters);
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > maxAccuracyMeters) return { allowed: false, reason: 'insufficient_accuracy' };
  const primary = normalizeId(employee.locationId || employee.siteId);
  const permissions = Array.isArray(employee.allowedSiteIds) ? employee.allowedSiteIds.map(normalizeId) : [];
  const permitted = new Set([primary, ...permissions].filter(Boolean));
  const current = new Date(now);
  for (const grant of Array.isArray(employee.temporarySiteGrants) ? employee.temporarySiteGrants : []) {
    if (!grant || !grant.siteId || !grant.from || !grant.until) continue;
    const from = new Date(grant.from), until = new Date(grant.until);
    if (Number.isFinite(from.getTime()) && Number.isFinite(until.getTime()) && current >= from && current <= until) permitted.add(normalizeId(grant.siteId));
  }
  if (!permitted.size) return { allowed: false, reason: 'no_site_permission' };
  const eligible = (Array.isArray(sites) ? sites : []).filter(site =>
    site && site.active !== false && !site.demoData &&
    normalizeId(site.companyId) === normalizeId(companyId) &&
    permitted.has(normalizeId(site.id || site._id)));
  const matches = eligible.map(site => ({ site, distance: distanceMeters(point, site) }))
    .filter(({ site, distance }) => Number.isFinite(distance) && distance <= Number(site.radiusMeters))
    .sort((a, b) => a.distance - b.distance);
  if (!matches.length) return { allowed: false, reason: 'outside_permitted_sites' };
  const winner = matches[0];
  return { allowed: true, siteId: normalizeId(winner.site.id || winner.site._id), distanceMeters: Math.round(winner.distance) };
}
module.exports = { authorizeAttendanceSite, distanceMeters };
