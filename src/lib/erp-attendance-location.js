/**
 * Geofenced attendance check-in helpers.
 */

function isPermissionDeniedError(err) {
  return err?.code === 1 || err?.code === err?.PERMISSION_DENIED;
}

/**
 * Start reading device location synchronously (call directly from a click handler).
 * @returns {Promise<{ latitude: number, longitude: number, accuracy: number | null }>}
 */
export function beginCheckInLocationCapture(options) {
  return requestDeviceLocation(options);
}

/** @returns {Promise<{ latitude: number, longitude: number, accuracy: number | null }>} */
export function requestDeviceLocation({ timeoutMs = 18000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location is not supported on this device.'));
      return;
    }

    const onSuccess = (pos) => {
      resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
      });
    };

    const onError = (err) => {
      if (isPermissionDeniedError(err)) {
        reject(
          new Error(
            'Location access was blocked. Click the lock icon in the address bar, allow Location, then try Check in again.',
          ),
        );
        return;
      }
      const code = err?.code;
      if (code === 2) {
        reject(new Error('Location unavailable. Move to an open area or check GPS/Wi‑Fi, then try again.'));
        return;
      }
      if (code === 3) {
        reject(new Error('Location request timed out. Try check-in again.'));
        return;
      }
      reject(new Error('Could not read your location.'));
    };

    // Must run in the same turn as the user click — do not await other work before this call.
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 0,
    });
  });
}

/** Haversine distance in meters (client-side preview only — server enforces). */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchAttendanceCheckInContext(supabase) {
  const { data, error } = await supabase.rpc('erp_attendance_check_in_context_pk');
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * Complete check-in after `beginCheckInLocationCapture()` was started on the same click.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Promise<{ latitude: number, longitude: number }>} coordsPromise
 */
export async function finalizeAttendanceCheckIn(supabase, coordsPromise) {
  const [coords, ctx] = await Promise.all([coordsPromise, fetchAttendanceCheckInContext(supabase)]);

  if (!ctx?.office_configured) {
    throw new Error(
      'Office location is not configured yet. Ask an admin to set it under Administration → Office hours.',
    );
  }

  const latitude = Number(coords?.latitude);
  const longitude = Number(coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Could not read your location. Allow location access when prompted, then try again.');
  }

  const { data, error } = await supabase.rpc('erp_attendance_check_in_pk', {
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (error) throw new Error(error.message);

  return { data, coords: { latitude, longitude }, context: ctx };
}

/**
 * Request device location and perform geofenced check-in.
 * Prefer calling `beginCheckInLocationCapture()` on click, then `finalizeAttendanceCheckIn()`.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function performAttendanceCheckIn(supabase) {
  return finalizeAttendanceCheckIn(supabase, beginCheckInLocationCapture());
}

export function isLocationCheckInError(message) {
  const s = String(message || '').toLowerCase();
  return (
    s.includes('location') ||
    s.includes('geolocation') ||
    s.includes('gps') ||
    s.includes('within') && s.includes('meters')
  );
}

/** User-facing hint before check-in. */
export function describeCheckInLocationPolicy(ctx) {
  if (!ctx) return 'Location access is required to check in.';
  if (ctx.remote_approved_today) {
    return 'Remote work approved today — you can check in from anywhere. Your location will still be recorded.';
  }
  if (!ctx.office_configured) {
    return 'Office location is not set up yet. Contact your administrator.';
  }
  const radius = ctx.radius_meters || 30;
  return `You must be within ${radius} meters of the office to check in. Location access is required.`;
}
