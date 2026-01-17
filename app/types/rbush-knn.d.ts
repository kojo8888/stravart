declare module 'rbush-knn' {
    import RBush from 'rbush'

    /**
     * K-nearest neighbors search for RBush spatial index
     * @param tree - RBush spatial index
     * @param x - X coordinate (longitude)
     * @param y - Y coordinate (latitude)
     * @param k - Number of nearest neighbors to return
     * @param predicate - Optional filter function
     * @param maxDistance - Optional maximum distance
     * @returns Array of k nearest items
     */
    function knn<T>(
        tree: RBush<T>,
        x: number,
        y: number,
        k?: number,
        predicate?: (item: T) => boolean,
        maxDistance?: number
    ): T[]

    export = knn
}
