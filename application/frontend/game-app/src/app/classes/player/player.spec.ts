import { Player, PlayerType } from './player';

describe('Player', () => {
    it('should create an instance', () => {
        expect(new Player('', PlayerType.HOST)).toBeTruthy();
    });
});
