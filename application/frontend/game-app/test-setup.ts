import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll } from 'vitest';

// Initialize Angular testing environment
// Guard against multiple calls (e.g. when vitest re-runs setup across workers)
try {
    getTestBed().initTestEnvironment(
        BrowserTestingModule,
        platformBrowserTesting(),
    )
} catch {
    // initTestEnvironment throws if called more than once — safe to ignore
}

// Fails a spec file leaving an interval running: it would keep firing, and logging, during the next spec files of the
// worker, and a log still pending when the worker closes fails the run (EnvironmentTeardownError) on another spec.
// The native functions are kept on the global object: the setup runs again for each spec file of the worker
const timers = globalThis as typeof globalThis & { nativeSetInterval?: typeof setInterval; nativeClearInterval?: typeof clearInterval };
timers.nativeSetInterval ??= globalThis.setInterval;
timers.nativeClearInterval ??= globalThis.clearInterval;
const nativeSetInterval: typeof setInterval = timers.nativeSetInterval;
const nativeClearInterval: typeof clearInterval = timers.nativeClearInterval;
const runningIntervals = new Map<ReturnType<typeof setInterval>, string>();

globalThis.setInterval = ((...args: Parameters<typeof setInterval>): ReturnType<typeof setInterval> => {
    const id = nativeSetInterval(...args);
    const stack: string = new Error('Interval started').stack ?? '';
    // Except the interval of the animation frames of jsdom, which it clears itself once the frame ran
    if (!stack.includes('/node_modules/jsdom/')) {
        runningIntervals.set(id, stack);
    }
    return id;
}) as typeof setInterval;

globalThis.clearInterval = ((id?: ReturnType<typeof setInterval>): void => {
    runningIntervals.delete(id as ReturnType<typeof setInterval>);
    nativeClearInterval(id);
}) as typeof clearInterval;

afterAll(() => {
    const stacks: string[] = [...runningIntervals.values()];
    runningIntervals.forEach((_stack: string, id: ReturnType<typeof setInterval>) => nativeClearInterval(id));
    runningIntervals.clear();

    if (stacks.length > 0) {
        throw new Error(`${ stacks.length } interval(s) left running, to clear in the spec:\n${ stacks.join('\n\n') }`);
    }
});
