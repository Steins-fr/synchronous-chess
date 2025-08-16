// Will log with current time formatted as [HH:mm:ss-SSS]
export class TimedLogger {
    private static formatNow(): string {
        const now = new Date();
        return `[${now.toLocaleTimeString('en-US', { hour12: false })}-${now.getMilliseconds()}]`;
    }

    private static getCallerInfo(): string {
        const stack = new Error().stack;
        if (!stack) {
            return '';
        }

        const stackLines = stack.split('\n');
        // Skip the first 3 lines: Error message, getCallerInfo, and the calling TimedLogger method
        const callerLine = stackLines[3];

        if (!callerLine) {
            return '';
        }

        // Extract function and column info from stack trace
        // Format varies by browser:
        // Chrome: "at functionName (file:line:column)" or "at file:line:column"
        // Firefox: "functionName@file:line:column"
        const chromeWithFunctionMatch = /at\s+([^()]+?)\s+\([^()]*:\d+:(\d+)\)/.exec(callerLine);
        const chromeWithoutFunctionMatch = /at\s+[^()]*:\d+:(\d+)/.exec(callerLine);
        const firefoxMatch = /([^@]+?)@[^:]*:\d+:(\d+)/.exec(callerLine);

        let functionName: string | undefined;
        let columnNumber: string | undefined;

        if (chromeWithFunctionMatch) {
            [, functionName, columnNumber] = chromeWithFunctionMatch;
        } else if (chromeWithoutFunctionMatch) {
            [, columnNumber] = chromeWithoutFunctionMatch;
        } else if (firefoxMatch) {
            [, functionName, columnNumber] = firefoxMatch;
        }

        if (columnNumber) {
            const func = functionName && functionName.trim() !== '' ? functionName.trim() : 'anonymous';
            return `[${func}:${columnNumber}]`;
        }

        return '';
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
