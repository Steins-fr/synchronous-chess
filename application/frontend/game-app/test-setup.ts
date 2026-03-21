import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

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
