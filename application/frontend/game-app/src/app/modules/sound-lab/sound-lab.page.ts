import { Component, computed, DestroyRef, inject, Signal, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { SoundCategory } from '@app/services/sound/enums/sound-category.enum';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { isFileSound, isLoopSound, LoopSoundEffect, SOUND_FILES, SOUND_LOOPS, SOUNDS_PATH } from '@app/services/sound/sound-files';
import { SoundService } from '@app/services/sound/sound.service';

type SoundFile = {
    label: string;
    // Under src/assets/sounds
    file: string;
};

// A way to play a sound: synthesized, without file, or from a file
type LabSource = Partial<SoundFile> & {
    icon: string;
    label: string;
};

type LabSound = {
    effect: SoundEffect;
    name: string;
    // When the game plays it
    plays: string;
    // The sound the game plays: each of its files for a sound of several
    sources: ReadonlyArray<Readonly<LabSource>>;
};

type LabGroup = {
    title: string;
    sounds: ReadonlyArray<Readonly<LabSound>>;
};

const fileSource = (file: Readonly<SoundFile>): Readonly<LabSource> => ({ icon: 'audio_file', ...file });

/** The sound the game plays: its files, its start then its loop, or synthesized */
const gameSources = (effect: SoundEffect): ReadonlyArray<Readonly<LabSource>> => {
    if (isFileSound(effect)) {
        return SOUND_FILES[effect].map((file: string) => fileSource({ label: file, file }));
    }
    return isLoopSound(effect)
        ? [{ icon: 'repeat', label: `${ SOUND_LOOPS[effect].file }, looping from ${ SOUND_LOOPS[effect].loopStart } s to ${ SOUND_LOOPS[effect].loopEnd } s` }]
        : [{ icon: 'graphic_eq', label: 'Synthesized' }];
};

const sound = (effect: SoundEffect, name: string, plays: string): Readonly<LabSound> => ({ effect, name, plays, sources: gameSources(effect) });

const GROUPS: ReadonlyArray<Readonly<LabGroup>> = [
    {
        title: 'Synchronous chess',
        sounds: [
            sound(SoundEffect.CHESS_MOVE, 'Move', 'A piece moved, of either player'),
            sound(SoundEffect.CHESS_CAPTURE, 'Capture', 'A piece taken'),
            sound(SoundEffect.CHESS_CHECK, 'Check', 'A king in check'),
            sound(SoundEffect.CHESS_CASTLING, 'Castling', 'The king and the rook moved together'),
            sound(SoundEffect.CHESS_PROMOTION, 'Promotion', 'A pawn promoted'),
            sound(SoundEffect.CHESS_TURN_START, 'Turn starting', 'A turn, synchronous or intermediate, starting'),
        ],
    },
    {
        title: 'Seventeen Poker',
        sounds: [
            sound(SoundEffect.POKER_SHUFFLE, 'Shuffle', 'The deck shuffled, before the deal'),
            sound(SoundEffect.POKER_DEAL, 'Deal', 'A card dealt'),
            sound(SoundEffect.POKER_CARD_TURN, 'Card turned', 'A card turned face up, at the showdown'),
            sound(SoundEffect.POKER_FOLD, 'Fold', 'A player folding'),
            sound(SoundEffect.POKER_POT_WON, 'Pot won', 'The pot going to the winner'),
            sound(SoundEffect.POKER_POT_LOST, 'Pot lost', 'The pot going to the other player, on the page of the player losing it'),
        ],
    },
    {
        title: 'Russian roulette',
        sounds: [
            sound(SoundEffect.ROULETTE_BULLET, 'Bullet put', 'A bullet put in a chamber, on the page of the player picking its chambers'),
            sound(SoundEffect.ROULETTE_LOAD, 'Bullets loaded', 'A player loading its bullets'),
            sound(SoundEffect.ROULETTE_SPIN, 'Cylinder spun', 'The cylinder thrown, then turning while the players load and spin it: a click on its button stops it'),
            sound(SoundEffect.ROULETTE_COCK, 'Hammer cocked', 'The revolver rising before the player, before the shot or the click'),
            sound(SoundEffect.ROULETTE_CLICK, 'Empty chamber', 'The hammer clicking on an empty chamber'),
            sound(SoundEffect.ROULETTE_SHOT, 'Shot', 'A bullet fired'),
        ],
    },
    {
        title: 'Every game',
        sounds: [
            sound(SoundEffect.SEAT_TAKEN, 'Seat taken', 'A participant taking a seat, on every page'),
            sound(SoundEffect.CHIPS, 'Chips moved', 'Chips flying over the table: a bet, a pass, a pot, the chips of the table taken'),
            sound(SoundEffect.GAME_WON, 'Won', 'The game, or the match, won: on the page of its winner, and of a spectator'),
            sound(SoundEffect.GAME_LOST, 'Lost', 'The game, or the match, lost: on the page of its loser'),
            sound(SoundEffect.GAME_DRAW, 'Draw', 'The game, or the match, drawn'),
        ],
    },
    {
        title: 'Chat and rooms',
        sounds: [
            sound(SoundEffect.CHAT_MESSAGE, 'Message', 'A message of another participant received unread, or while the page is hidden'),
            sound(SoundEffect.ROOM_JOIN, 'Joining', 'A participant joining the room'),
            sound(SoundEffect.ROOM_LEAVE, 'Leaving', 'A participant leaving the room'),
        ],
    },
];

/**
 * Every sound of the games, each with a button playing it as the game does: synthesized at runtime, or from its CC0 files.
 * Developer tooling, linked from nowhere, in English out of the translations
 */
@Component({
    selector: 'app-sound-lab-page',
    templateUrl: './sound-lab.page.html',
    imports: [MatButton, MatIcon],
})
export class SoundLabPage {
    protected readonly groups: ReadonlyArray<Readonly<LabGroup>> = GROUPS;
    protected readonly soundService = inject(SoundService);
    /** What the toolbar mutes: the sounds of a category muted play nothing here either, its files played apart */
    protected readonly mutedNote: Signal<string | null> = computed((): string | null => {
        if (this.soundService.muted()) {
            return 'The sounds are muted: unmute them in the toolbar.';
        }
        const muted: ReadonlyArray<string> = [SoundCategory.GAME, SoundCategory.CHAT].filter((category: SoundCategory) => this.soundService.categoryMuted(category));
        return muted.length === 0 ? null : `The sounds of the ${ muted.join(' and of the ') } are muted: unmute them in the toolbar.`;
    });
    // The files that failed to load
    protected readonly failedFiles = signal<ReadonlySet<string>>(new Set());
    /** The sound looping, until its button stops it */
    protected readonly looping = signal<SoundEffect | null>(null);
    private stopLoop: () => void = () => undefined;

    public constructor() {
        inject(DestroyRef).onDestroy(() => this.stopLoop());
    }

    protected play(effect: SoundEffect, { file }: Readonly<LabSource>): void {
        if (isLoopSound(effect)) {
            this.toggleLoop(effect);
            return;
        }

        if (file === undefined) {
            this.soundService.play(effect);
            return;
        }

        this.soundService.playFile(`${ SOUNDS_PATH }${ file }`).catch(() => this.failedFiles.update((failed: ReadonlySet<string>) => new Set([...failed, file])));
    }

    /** Starts the sound looping, or stops it once looping */
    private toggleLoop(effect: LoopSoundEffect): void {
        const stopping: boolean = this.looping() === effect;
        this.stopLoop();
        this.stopLoop = () => undefined;
        this.looping.set(null);

        if (!stopping) {
            this.stopLoop = this.soundService.loop(effect);
            this.looping.set(effect);
        }
    }
}
