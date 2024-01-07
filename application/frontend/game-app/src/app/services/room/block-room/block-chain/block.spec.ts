import { Block } from './block';

describe('Block', () => {
    it('should create an instance', () => {
        expect(new Block(0, '', {
            from: '',
            type: '',
            payload: '',
        }, '', '', '')).toBeTruthy();
    });
});
