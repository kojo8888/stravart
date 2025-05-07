declare module 'fmin' {
    export default function fmin(
        f: (x: number[]) => number,
        x0: number[]
    ): { x: number[], f: number };
}
