import PromotionTurn from './promotion-turn';
import { FenColumn, FenRow } from '../interfaces/move';

describe('PromotionTurn', () => {
    it('should create an instance', () => {
        expect(new PromotionTurn({ whiteFenCoordinate: [FenColumn.A, FenRow._1], blackFenCoordinate: [FenColumn.A, FenRow._2] }, null)).toBeTruthy();
    });
});
