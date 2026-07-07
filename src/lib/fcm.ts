import { getToken, deleteToken, onMessage } from 'firebase/messaging'

import { FCM_VAPID_KEY, getMessagingIfSupported } from './firebase'
import { supabase } from './supabase'

export type EnablePushResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no-vapid' | 'error'; message: string }

/** True if this browser can even attempt FCM web push. */
export async function isPushSupported(): Promise<boolean> {
  return (await getMessagingIfSupported()) !== null
}

/**
 * Requests notification permission, obtains an FCM token, and stores it for the
 * current user. Requires VITE_FIREBASE_VAPID_KEY to be configured.
 */
export async function enablePush(userId: string): Promise<EnablePushResult> {
  const messaging = await getMessagingIfSupported()
  if (!messaging) {
    return { ok: false, reason: 'unsupported', message: '이 브라우저는 웹 푸시를 지원하지 않습니다.' }
  }
  if (!FCM_VAPID_KEY) {
    return {
      ok: false,
      reason: 'no-vapid',
      message:
        '푸시 발송 키(VITE_FIREBASE_VAPID_KEY)가 아직 설정되지 않았습니다. 관리자가 Firebase 웹 푸시 인증서를 등록하면 활성화됩니다.',
    }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied', message: '알림 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.' }
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    })
    if (!token) {
      return { ok: false, reason: 'error', message: '토큰을 발급받지 못했습니다. 잠시 후 다시 시도해 주세요.' }
    }

    const { error } = await supabase.from('user_device_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: 'web',
        user_agent: navigator.userAgent.slice(0, 300),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    )
    if (error) {
      return { ok: false, reason: 'error', message: error.message }
    }

    await supabase.from('users').update({ push_consent: true }).eq('id', userId)
    return { ok: true, token }
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

/** Removes this device's token and clears the consent flag. */
export async function disablePush(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const messaging = await getMessagingIfSupported()
    let token: string | null = null
    if (messaging && FCM_VAPID_KEY) {
      try {
        token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY })
        await deleteToken(messaging)
      } catch {
        /* token may already be gone */
      }
    }
    if (token) {
      await supabase.from('user_device_tokens').delete().eq('user_id', userId).eq('token', token)
    } else {
      // Fallback: drop all of this user's tokens if we can't identify the current one.
      await supabase.from('user_device_tokens').delete().eq('user_id', userId)
    }
    await supabase.from('users').update({ push_consent: false }).eq('id', userId)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** Foreground message handler — shows an in-page notification while the tab is open. */
export async function listenForegroundPush(onShow: (title: string, body: string) => void): Promise<() => void> {
  const messaging = await getMessagingIfSupported()
  if (!messaging) return () => {}
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || 'NH-AX-HUB'
    const body = payload.notification?.body || payload.data?.body || ''
    onShow(title, body)
  })
}
