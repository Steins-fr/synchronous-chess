import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'range'
})
export class RangePipe implements PipeTransform {

    public transform(size: number): Array<number> {
        return [...Array(size).keys()];
    }

}
