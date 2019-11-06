import { Pipe, PipeTransform } from '@angular/core';
import Vec2 from 'vec2';

@Pipe({
    name: 'vector2d'
})
export class Vector2dPipe implements PipeTransform {

    public transform(value: Array<number>): Vec2 {
        return new Vec2(value);
    }

}
