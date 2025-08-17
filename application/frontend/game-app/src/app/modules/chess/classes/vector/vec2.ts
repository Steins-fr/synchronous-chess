export type Vec2Array = [number, number];

// Immutable 2D vector class
export class Vec2 {
    public static fromArray(array: Vec2Array): Vec2 {
        return new Vec2(array[0], array[1]);
    }

    public static fromVec(vec: Vec2): Vec2 {
        return new Vec2(vec.x, vec.y);
    }

    public constructor(public x: number, public y: number) {}

    public add(x: number, y: number): Vec2 {
        return new Vec2(this.x + x, this.y + y);
    }

    public addVec(vec: Vec2): Vec2 {
        return new Vec2(this.x + vec.x, this.y + vec.y);
    }

    public sub(x: number, y: number): Vec2 {
        return new Vec2(this.x - x, this.y - y);
    }

    public subVec(vec: Vec2): Vec2 {
        return new Vec2(this.x - vec.x, this.y - vec.y);
    }

    public mul(x: number, y: number): Vec2 {
        return new Vec2(this.x * x, this.y * y);
    }

    public mulVec(vec: Vec2): Vec2 {
        return new Vec2(this.x * vec.x, this.y * vec.y);
    }

    public div(x: number, y: number): Vec2 {
        return new Vec2(this.x / x, this.y / y);
    }

    public divVec(vec: Vec2): Vec2 {
        return new Vec2(this.x / vec.x, this.y / vec.y);
    }

    public distance(x: number, y: number): number {
        return Math.sqrt(Math.pow(this.x - x, 2) + Math.pow(this.y - y, 2));
    }

    public distanceVec(vec: Vec2): number {
        return Math.sqrt(Math.pow(this.x - vec.x, 2) + Math.pow(this.y - vec.y, 2));
    }

    public equal(x: number, y: number): boolean {
        return this.x === x && this.y === y;
    }

    public toArray(): [number, number] {
        return [this.x, this.y];
    }
}
