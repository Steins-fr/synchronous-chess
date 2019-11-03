import { RangePipe } from './range.pipe';

describe('RangePipe', () => {
    it('create an instance', () => {
        const pipe: RangePipe = new RangePipe();
        expect(pipe).toBeTruthy();
    });

    it('return an array from 0 to 7', () => {
        const pipe: RangePipe = new RangePipe();
        const size: number = 8;
        const result: Array<number> = pipe.transform(size);
        for (let i: number = 0; i < size; ++i) {
            expect(result[i]).toEqual(i);
        }
    });
});
