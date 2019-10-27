export default abstract class Exception extends Error {

    public abstract type: string;

    public constructor(message: string) {
        super(message);
    }
}
