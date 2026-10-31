import { vi } from 'vitest';

// The Web Audio API, absent from jsdom: the nodes record what the sounds do, nothing plays

export class AudioParamMock {
    // A gain starts at 1, as in a browser
    public value: number = 1;
    public readonly setValueAtTime = vi.fn();
    public readonly linearRampToValueAtTime = vi.fn();
    public readonly exponentialRampToValueAtTime = vi.fn();
}

export class AudioNodeMock {
    public readonly connections: AudioNodeMock[] = [];

    public connect<T extends AudioNodeMock>(destination: T): T {
        this.connections.push(destination);
        return destination;
    }

    public readonly disconnect = vi.fn();
}

export class GainNodeMock extends AudioNodeMock {
    public readonly gain = new AudioParamMock();
}

export class BiquadFilterNodeMock extends AudioNodeMock {
    public type: BiquadFilterType = 'lowpass';
    public readonly frequency = new AudioParamMock();
    public readonly Q = new AudioParamMock();
}

export class ScheduledSourceNodeMock extends AudioNodeMock {
    public readonly start = vi.fn();
    public readonly stop = vi.fn();
}

export class OscillatorNodeMock extends ScheduledSourceNodeMock {
    public type: OscillatorType = 'sine';
    public readonly frequency = new AudioParamMock();
}

export class AudioBufferSourceNodeMock extends ScheduledSourceNodeMock {
    public buffer: AudioBuffer | null = null;
    public loop: boolean = false;
}

export class AudioBufferMock {
    public readonly channels: Float32Array[] = [];

    public constructor(public readonly numberOfChannels: number, public readonly length: number, public readonly sampleRate: number) {}

    public get duration(): number {
        return this.length / this.sampleRate;
    }

    public copyToChannel(source: Float32Array, channel: number): void {
        this.channels[channel] = source;
    }
}

/** An AudioContext, suspended until resumed as a browser starts it at a gesture. Its instances are listed, the latest last */
export class AudioContextMock {
    public static readonly instances: AudioContextMock[] = [];

    public state: AudioContextState = 'suspended';
    public currentTime: number = 0;
    public readonly sampleRate: number = 48_000;
    public readonly destination = new AudioNodeMock();
    // The gains created, the volume of the sounds first
    public readonly gains: GainNodeMock[] = [];
    // The sources started, oscillators, noises and files
    public readonly sources: ScheduledSourceNodeMock[] = [];
    public readonly resume = vi.fn((): Promise<void> => {
        this.state = 'running';
        return Promise.resolve();
    });
    public readonly suspend = vi.fn((): Promise<void> => {
        this.state = 'suspended';
        return Promise.resolve();
    });
    public readonly decodeAudioData = vi.fn((data: ArrayBuffer): Promise<AudioBuffer> =>
        Promise.resolve(new AudioBufferMock(1, data.byteLength, this.sampleRate) as unknown as AudioBuffer));

    public constructor() {
        AudioContextMock.instances.push(this);
    }

    /** Installs the mock as the AudioContext of the page, until vi.unstubAllGlobals() */
    public static install(): void {
        AudioContextMock.instances.length = 0;
        vi.stubGlobal('AudioContext', AudioContextMock);
    }

    public static latest(): AudioContextMock | undefined {
        return AudioContextMock.instances.at(-1);
    }

    public createGain(): GainNodeMock {
        const gain = new GainNodeMock();
        this.gains.push(gain);
        return gain;
    }

    public createBiquadFilter(): BiquadFilterNodeMock {
        return new BiquadFilterNodeMock();
    }

    public createOscillator(): OscillatorNodeMock {
        return this.started(new OscillatorNodeMock());
    }

    public createBufferSource(): AudioBufferSourceNodeMock {
        return this.started(new AudioBufferSourceNodeMock());
    }

    public createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferMock {
        return new AudioBufferMock(numberOfChannels, length, sampleRate);
    }

    private started<T extends ScheduledSourceNodeMock>(source: T): T {
        this.sources.push(source);
        return source;
    }
}
