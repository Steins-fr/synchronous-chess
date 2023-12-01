import { Pipe, PipeTransform } from '@angular/core';
import { Vec2 } from '@app/classes/vector/vec2';

@Pipe({
    name: 'vector2d',
    standalone: true,
})
export class Vector2dPipe implements PipeTransform {

    public transform(value: [number, number]): Vec2 {
        return new Vec2(value[0], value[1]);
    }

}
