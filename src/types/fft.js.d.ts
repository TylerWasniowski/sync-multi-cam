declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);
    readonly size: number;
    createComplexArray(): number[];
    toComplexArray(input: ArrayLike<number>, storage?: number[]): number[];
    fromComplexArray(complex: ArrayLike<number>, storage?: number[]): number[];
    realTransform(output: ArrayLike<number>, input: ArrayLike<number>): void;
    completeSpectrum(spectrum: ArrayLike<number>): void;
    transform(output: ArrayLike<number>, input: ArrayLike<number>): void;
    inverseTransform(output: ArrayLike<number>, input: ArrayLike<number>): void;
  }
}
