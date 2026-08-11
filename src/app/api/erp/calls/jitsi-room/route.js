import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

const INTERNAL_ROLES = new Set(['admin', 'team_lead', 'team_member']);

/** RFC 4648 §5 base64url, no padding. */
function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Vercel / .env often store PEM as one line with \n escapes: normalize for crypto.
 */
function normalizeJaasPrivateKeyPem(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  let s = raw.trim().replace(/^\uFEFF/, '');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Literal backslash-n (common when pasting RSA blocks into dashboards)
  s = s.replace(/\\n/g, '\n');
  return s.trim();
}

/**
 * Mint a JaaS-compatible JWT. RS256 signed with the JaaS API key private key.
 * Spec: https://developer.8x8.com/jaas/docs/api-keys-jwt
 */
function signJaaSJwt({ appId, kid, privateKeyPemOrKey, user, room, isModerator }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: appId,
    iat: now,
    nbf: now - 10,
    exp: now + 60 * 60 * 2,
    room: room || '*',
    context: {
      user: {
        id: user.id,
        name: user.name || 'Member',
        email: user.email || '',
        avatar: user.avatar || '',
        moderator: isModerator ? 'true' : 'false',
      },
      features: {
        livestreaming: true,
        recording: true,
        transcription: true,
        'outbound-call': true,
        'sip-outbound-call': false,
        'file-upload': true,
        'list-visitors': false,
      },
    },
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPemOrKey);
  return `${signingInput}.${b64url(signature)}`;
}

/**
 * Returns a deterministic Jitsi room name for the current DM or group thread.
 * Room names are hashed with JITSI_ROOM_SECRET so IDs are not exposed in the URL.
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!INTERNAL_ROLES.has(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const peerUserId = typeof body.peerUserId === 'string' ? body.peerUserId : null;
  const groupId = typeof body.groupId === 'string' ? body.groupId : null;

  if ((Boolean(peerUserId) && Boolean(groupId)) || (!peerUserId && !groupId)) {
    return NextResponse.json({ error: 'Provide exactly one of peerUserId or groupId' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let roomKey;
  if (peerUserId) {
    if (peerUserId === user.id) {
      return NextResponse.json({ error: 'Invalid peer' }, { status: 400 });
    }
    const { data: peer } = await admin.from('erp_profiles').select('id, role').eq('id', peerUserId).maybeSingle();
    if (!peer?.id || !INTERNAL_ROLES.has(peer.role)) {
      return NextResponse.json({ error: 'Invalid recipient' }, { status: 403 });
    }
    const [a, b] = [user.id, peerUserId].sort();
    roomKey = `dm:${a}:${b}`;
  } else {
    const { data: mem } = await admin
      .from('erp_message_group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!mem) {
      return NextResponse.json({ error: 'Not a group member' }, { status: 403 });
    }
    roomKey = `grp:${groupId}`;
  }

  const secret =
    process.env.JITSI_ROOM_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 48) ||
    'digitalis-erp-dev-jitsi-room-secret-change-me';
  const hash = crypto.createHmac('sha256', secret).update(roomKey).digest('hex');
  const baseRoomName = `ErpCall${hash.slice(0, 26)}`;

  const jaasAppId = process.env.JAAS_APP_ID?.trim();
  const jaasKid = process.env.JAAS_KID?.trim();
  const jaasPrivateKeyPem = normalizeJaasPrivateKeyPem(process.env.JAAS_PRIVATE_KEY);
  const jaasReady = Boolean(jaasAppId && jaasKid && jaasPrivateKeyPem);

  const rawDomain = process.env.NEXT_PUBLIC_JITSI_DOMAIN || (jaasReady ? '8x8.vc' : 'meet.jit.si');
  const domain = rawDomain.replace(/^https?:\/\//, '').split('/')[0].trim() || 'meet.jit.si';

  if (jaasReady) {
    const roomName = `${jaasAppId}/${baseRoomName}`;
    let jwt = '';
    let signingKey;
    try {
      signingKey = crypto.createPrivateKey({
        key: jaasPrivateKeyPem,
        format: 'pem',
      });
    } catch (e) {
      console.error('[jitsi-room] Invalid JAAS_PRIVATE_KEY (PEM):', e?.message || e);
      return NextResponse.json({ error: 'Call provider misconfigured' }, { status: 500 });
    }

    try {
      jwt = signJaaSJwt({
        appId: jaasAppId,
        kid: jaasKid,
        privateKeyPemOrKey: signingKey,
        user: {
          id: user.id,
          name: profile.full_name || 'Member',
          email: user.email || '',
        },
        room: baseRoomName,
        isModerator: profile.role === 'admin',
      });
    } catch (e) {
      console.error('[jitsi-room] JaaS JWT signing failed:', e?.message || e);
      return NextResponse.json({ error: 'Call provider misconfigured' }, { status: 500 });
    }
    return NextResponse.json({
      roomName,
      domain,
      jwt,
      joinUrl: `https://${domain}/${encodeURIComponent(roomName)}?jwt=${jwt}`,
    });
  }

  return NextResponse.json({
    roomName: baseRoomName,
    domain,
    joinUrl: `https://${domain}/${encodeURIComponent(baseRoomName)}`,
  });
}
