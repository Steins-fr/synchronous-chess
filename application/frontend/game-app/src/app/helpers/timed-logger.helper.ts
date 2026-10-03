// Will log with current time formatted as [HH:mm:ss-SSS]
export class TimedLogger {
    private static formatNow(): string {
        const now = new Date();
        return `[${now.toLocaleTimeString('en-US', { hour12: false })}-${now.getMilliseconds()}]`;
    }

    private static getCallerInfo(): string {
        const stack = new Error('caller').stack;
        if (!stack) {
            return '';
        }

        const stackLines = stack.split('\n');
        // Skip the first 3 lines: Error message, getCallerInfo, and the calling TimedLogger method
        const callerLine = stackLines[3];

        if (!callerLine) {
            return '';
        }

        const { functionName, columnNumber } = TimedLogger.parseStackLine(callerLine);

        if (columnNumber) {
            const func = functionName && functionName.trim() !== '' ? functionName.trim() : 'anonymous';
            return `[${func}:${columnNumber}]`;
        }

        return '';
    }

    // Format varies by browser:
    // Chrome: "at functionName (file:line:column)" or "at file:line:column"
    // Firefox: "functionName@file:line:column"
    // Parsed without regular expressions, whose backtracking would be super-linear on these lines
    private static parseStackLine(stackLine: string): { functionName?: string; columnNumber?: string } {
        const line = stackLine.trim();

        if (line.startsWith('at ')) {
            const frame = line.slice(3).trim();
            const locationStart = frame.lastIndexOf(' (');

            if (locationStart !== -1 && frame.endsWith(')')) {
                return {
                    functionName: frame.slice(0, locationStart),
                    columnNumber: TimedLogger.columnOf(frame.slice(locationStart + 2, -1)),
                };
            }

            return { columnNumber: TimedLogger.columnOf(frame) };
        }

        const functionEnd = line.indexOf('@');
        if (functionEnd !== -1) {
            return {
                functionName: line.slice(0, functionEnd),
                columnNumber: TimedLogger.columnOf(line.slice(functionEnd + 1)),
            };
        }

        return {};
    }

    // A location ends with ":line:column"
    private static columnOf(location: string): string | undefined {
        const parts = location.split(':');
        if (parts.length < 3) {
            return undefined;
        }

        const [line, column] = parts.slice(-2);
        return TimedLogger.isNumber(line) && TimedLogger.isNumber(column) ? column : undefined;
    }

    private static isNumber(value: string): boolean {
        return /^\d+$/.test(value);
    }

    public static log(...message: unknown[]): void {
        const caller = this.getCallerInfo();
        console.debug(this.formatNow(), caller, ...message);
    }

    public static trace(...message: unknown[]): void {
        const caller = this.getCallerInfo();
        // eslint-disable-next-line no-console
        console.trace(this.formatNow(), caller, '[TRACE]', ...message);
    }

    public static warn(...message: unknown[]): void {
        const caller = this.getCallerInfo();
        console.warn(this.formatNow(), caller, ...message);
    }

    public static error(...message: unknown[]): void {
        const caller = this.getCallerInfo();
        console.error(this.formatNow(), caller, ...message);
    }
}
