export default abstract class Exception extends Error {
    public abstract type: string;

    protected constructor(message: string) {
        super(message);
    }
}
