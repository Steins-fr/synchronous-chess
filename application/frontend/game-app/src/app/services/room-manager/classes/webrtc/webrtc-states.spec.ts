import WebrtcStates from './webrtc-states';
import { describe, test, expect } from 'vitest';

describe('WebrtcState', () => {
    test('should create an instance', () => {
        expect(new WebrtcStates()).toBeTruthy();
    });
});
