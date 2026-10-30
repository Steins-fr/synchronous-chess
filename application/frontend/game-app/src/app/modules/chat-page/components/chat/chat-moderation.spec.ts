import {
    ChatDecision,
    ChatModeration,
    ChatModerationAction,
    decisionText,
    isChatDecision,
    isSilenced,
    moderateChat,
    MuteMinutes,
    NO_MODERATION
} from './chat-moderation';
import { describe, expect, test } from 'vitest';

const MINUTE: number = 60_000;

/** The decisions of the chain in their order, each one at its time: the moderation in force, and whether each one changed it */
function moderate(decisions: ReadonlyArray<readonly [ChatDecision, number]>, moderation: ChatModeration = NO_MODERATION): { moderation: ChatModeration; changes: boolean[] } {
    const changes: boolean[] = [];
    for (const [decision, time] of decisions) {
        const result = moderateChat(moderation, decision, time);
        moderation = result.moderation;
        changes.push(result.changed);
    }
    return { moderation, changes };
}

function mute(target: string, minutes: MuteMinutes | null): ChatDecision {
    return { action: ChatModerationAction.MUTE, target, minutes };
}

function unmute(target: string): ChatDecision {
    return { action: ChatModerationAction.UNMUTE, target };
}

function remove(target: string): ChatDecision {
    return { action: ChatModerationAction.REMOVE, target };
}

describe('isChatDecision', () => {
    test('should accept a decision of the form the application sends', () => {
        expect(isChatDecision(mute('bob', MuteMinutes.SHORT))).toEqual(true);
        expect(isChatDecision(mute('bob', MuteMinutes.LONG))).toEqual(true);
        expect(isChatDecision(mute('bob', null))).toEqual(true);
        expect(isChatDecision(unmute('b'.repeat(32)))).toEqual(true);
        expect(isChatDecision(remove('bob'))).toEqual(true);
    });

    test('should refuse anything else', () => {
        expect(isChatDecision(null)).toEqual(false);
        expect(isChatDecision('mute')).toEqual(false);
        expect(isChatDecision({ action: ChatModerationAction.REMOVE })).toEqual(false);
        expect(isChatDecision({ action: ChatModerationAction.REMOVE, target: 1 })).toEqual(false);
        expect(isChatDecision(remove(''))).toEqual(false);
        expect(isChatDecision(remove('b'.repeat(33)))).toEqual(false);
        expect(isChatDecision({ action: ChatModerationAction.MUTE, target: 'bob' })).toEqual(false);
        expect(isChatDecision({ action: ChatModerationAction.MUTE, target: 'bob', minutes: 10 })).toEqual(false);
        expect(isChatDecision({ action: 'ban', target: 'bob' })).toEqual(false);
    });
});

describe('moderateChat', () => {
    test('should mute an author for its minutes from the time of the decision, or until the end of the room', () => {
        // When
        const { moderation, changes } = moderate([[mute('bob', MuteMinutes.SHORT), 1000], [mute('carol', null), 2000]]);

        // Then
        expect(moderation.mutes).toEqual(new Map([['bob', 1000 + 5 * MINUTE], ['carol', Number.POSITIVE_INFINITY]]));
        expect(changes).toEqual([true, true]);
    });

    test('should keep the latest mute of an author, shorter or longer', () => {
        // When
        const { moderation } = moderate([[mute('bob', null), 0], [mute('bob', MuteMinutes.LONG), 1000], [mute('bob', MuteMinutes.SHORT), 2000]]);

        // Then
        expect(moderation.mutes.get('bob')).toEqual(2000 + 5 * MINUTE);
    });

    test('should unmute an author, changing something only while it is muted', () => {
        // When: unmuted while muted, after its mute ended, then never muted
        const { moderation, changes } = moderate([
            [mute('bob', MuteMinutes.SHORT), 0], [unmute('bob'), MINUTE],
            [mute('carol', MuteMinutes.SHORT), 0], [unmute('carol'), 5 * MINUTE],
            [unmute('dave'), 0],
        ]);

        // Then
        expect(changes).toEqual([true, true, true, false, false]);
        expect(moderation.mutes.size).toEqual(0);
    });

    test('should remove a participant, ending its mute, any later decision on it meaning nothing', () => {
        // When
        const { moderation, changes } = moderate([[mute('bob', null), 0], [remove('bob'), 1000], [mute('bob', MuteMinutes.SHORT), 2000], [unmute('bob'), 3000], [remove('bob'), 4000]]);

        // Then
        expect(changes).toEqual([true, true, false, false, false]);
        expect(moderation.mutes.size).toEqual(0);
        expect(moderation.removed).toEqual(new Set(['bob']));
    });

    test('should never change the moderation it is given', () => {
        // Given
        const { moderation } = moderate([[mute('bob', MuteMinutes.SHORT), 0]]);

        // When
        moderate([[mute('carol', null), 0], [unmute('bob'), 0], [remove('dave'), 0]], moderation);

        // Then
        expect(moderation).toEqual({ mutes: new Map([['bob', 5 * MINUTE]]), removed: new Set() });
        expect(NO_MODERATION).toEqual({ mutes: new Map(), removed: new Set() });
    });
});

describe('isSilenced', () => {
    test('should silence an author muted until its mute ends, and a participant removed for good', () => {
        // Given
        const { moderation } = moderate([[mute('bob', MuteMinutes.SHORT), 0], [mute('carol', null), 0], [remove('dave'), 0]]);

        // Then
        expect(isSilenced(moderation, 'bob', 5 * MINUTE - 1)).toEqual(true);
        expect(isSilenced(moderation, 'bob', 5 * MINUTE)).toEqual(false);
        expect(isSilenced(moderation, 'carol', Number.MAX_SAFE_INTEGER)).toEqual(true);
        expect(isSilenced(moderation, 'dave', Number.MAX_SAFE_INTEGER)).toEqual(true);
        expect(isSilenced(moderation, 'erin', 0)).toEqual(false);
    });
});

describe('decisionText', () => {
    test('should word a mute for its moderator, its target and the others', () => {
        expect(decisionText(mute('bob', MuteMinutes.SHORT), 'alice', 'alice')).toEqual({ key: 'chat.log.mute.byYou', params: { moderator: 'alice', name: 'bob', minutes: 5 } });
        expect(decisionText(mute('bob', MuteMinutes.LONG), 'alice', 'bob')).toEqual({ key: 'chat.log.mute.you', params: { moderator: 'alice', name: 'bob', minutes: 30 } });
        expect(decisionText(mute('bob', MuteMinutes.SHORT), 'alice', 'carol')).toEqual({ key: 'chat.log.mute.other', params: { moderator: 'alice', name: 'bob', minutes: 5 } });
        expect(decisionText(mute('bob', null), 'alice', 'alice')).toEqual({ key: 'chat.log.mute.byYouToEnd', params: { moderator: 'alice', name: 'bob' } });
        expect(decisionText(mute('bob', null), 'alice', 'bob')).toEqual({ key: 'chat.log.mute.youToEnd', params: { moderator: 'alice', name: 'bob' } });
        expect(decisionText(mute('bob', null), 'alice', 'carol')).toEqual({ key: 'chat.log.mute.otherToEnd', params: { moderator: 'alice', name: 'bob' } });
    });

    test('should word an unmute and a removal, the page of the target reading the removal as the others', () => {
        expect(decisionText(unmute('bob'), 'alice', 'alice')).toEqual({ key: 'chat.log.unmute.byYou', params: { moderator: 'alice', name: 'bob' } });
        expect(decisionText(unmute('bob'), 'alice', 'bob')).toEqual({ key: 'chat.log.unmute.you', params: { moderator: 'alice', name: 'bob' } });
        expect(decisionText(unmute('bob'), 'alice', 'carol')).toEqual({ key: 'chat.log.unmute.other', params: { moderator: 'alice', name: 'bob' } });
        expect(decisionText(remove('bob'), 'alice', 'alice')).toEqual({ key: 'chat.log.removal.byYou', params: { moderator: 'alice', name: 'bob' } });
        expect(decisionText(remove('bob'), 'alice', 'bob')).toEqual({ key: 'chat.log.removal.other', params: { moderator: 'alice', name: 'bob' } });
        expect(decisionText(remove('bob'), 'alice', 'carol')).toEqual({ key: 'chat.log.removal.other', params: { moderator: 'alice', name: 'bob' } });
    });
});
