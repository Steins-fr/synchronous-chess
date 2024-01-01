export interface Zone {
    run: (fn: () => void) => void;
}
