import { ref, onUnmounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export interface TileGeoPosition {
  latitude: number
  longitude: number
  accuracy: number
}

export type GeoStatus = 'idle' | 'starting' | 'tracking' | 'denied' | 'unsupported' | 'error'

export function useTileViewerGeolocation() {
  const status = ref<GeoStatus>('idle')
  const message = ref<string | null>(null)
  let watchId: string | number | null = null

  function stop() {
    if (watchId !== null) {
      if (Capacitor.isNativePlatform()) {
        void Geolocation.clearWatch({ id: watchId as string })
      } else {
        navigator.geolocation.clearWatch(watchId as number)
      }
      watchId = null
    }
    if (status.value === 'tracking' || status.value === 'starting') {
      status.value = 'idle'
    }
  }

  async function start(onFix: (p: TileGeoPosition) => void): Promise<void> {
    stop()
    message.value = null
    status.value = 'starting'

    if (!Capacitor.isNativePlatform() && !navigator.geolocation) {
      status.value = 'unsupported'
      message.value = 'Geolocation není v tomto prohlížeči k dispozici.'
      return
    }

    const opts: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    }

    try {
      if (Capacitor.isNativePlatform()) {
        const perm = await Geolocation.requestPermissions()
        if (perm.location !== 'granted') {
          status.value = 'denied'
          message.value = 'Přístup k poloze byl zamítnut.'
          return
        }

        const watchPromise = Geolocation.watchPosition(
          {
            enableHighAccuracy: opts.enableHighAccuracy,
            timeout: opts.timeout,
            maximumAge: opts.maximumAge,
          },
          (position, err) => {
            if (err) {
              message.value = err.message ?? String(err)
              status.value = 'error'
              return
            }
            if (!position) return
            status.value = 'tracking'
            onFix({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy ?? 0,
            })
          },
        )
        watchId = await watchPromise
      } else {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            status.value = 'tracking'
            onFix({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            })
          },
          (err) => {
            message.value = err.message
            status.value = err.code === err.PERMISSION_DENIED ? 'denied' : 'error'
          },
          opts,
        )
      }
    } catch (e) {
      status.value = 'error'
      message.value = e instanceof Error ? e.message : String(e)
    }
  }

  onUnmounted(stop)

  return { status, message, start, stop }
}
