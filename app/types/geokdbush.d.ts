declare module 'geokdbush' {
    import type KDBush from 'kdbush'

    export function around<T>(
        index: KDBush<T>,
        longitude: number,
        latitude: number,
        maxResults?: number,
        maxDistance?: number
    ): T[]
}
