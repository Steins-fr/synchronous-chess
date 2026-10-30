import { marker } from '@jsverse/transloco-keys-manager/marker';
import { PLAYER_NAME_MAX_LENGTH } from '@protocol/room-limits';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslatableText } from '@app/types/translatable-text.type';

export enum ChatModerationAction {
    MUTE = 'mute',
    UNMUTE = 'unmute',
    REMOVE = 'remove',
}

/** The lengths of a mute the moderator picks from, in minutes */
export enum MuteMinutes {
    SHORT = 5,
    LONG = 30,
}

/** The messages of the target ordered after it are hidden, for a while, or until the end of the room (null) */
export interface MuteDecision {
    readonly action: ChatModerationAction.MUTE;
    readonly target: string;
    readonly minutes: MuteMinutes | null;
}

export interface UnmuteDecision {
    readonly action: ChatModerationAction.UNMUTE;
    readonly target: string;
}

/** The target leaves the room, refused by every page as long as it lasts */
export interface RemoveDecision {
    readonly action: ChatModerationAction.REMOVE;
    readonly target: string;
}

/**
 * A decision of the moderator of the room on a participant, in the chain of the chat: every page applies it alike, the
 * history included
 */
export type ChatDecision = MuteDecision | UnmuteDecision | RemoveDecision;

/** A decision from a peer, of the form the application sends: a target named as a player, a length of mute picked from the menu */
export function isChatDecision(payload: unknown): payload is ChatDecision {
    const decision: Partial<Record<'action' | 'target' | 'minutes', unknown>> = (typeof payload === 'object' && payload !== null ? payload : {});
    if (typeof decision.target !== 'string' || decision.target.length === 0 || decision.target.length > PLAYER_NAME_MAX_LENGTH) {
        return false;
    }
    switch (decision.action) {
        case ChatModerationAction.MUTE:
            return decision.minutes === null || decision.minutes === MuteMinutes.SHORT || decision.minutes === MuteMinutes.LONG;
        case ChatModerationAction.UNMUTE:
        case ChatModerationAction.REMOVE:
            return true;
        default:
            return false;
    }
}

/** The decisions in force on the chain: the same on every page, the history included */
export interface ChatModeration {
    /** The authors muted, with the chain time their mute ends: Number.POSITIVE_INFINITY until the end of the room */
    readonly mutes: ReadonlyMap<string, number>;
    /** The participants removed: refused for as long as the room lasts */
    readonly removed: ReadonlySet<string>;
}

export interface ChatModerationResult {
    readonly moderation: ChatModeration;
    /** The decision changed something: the log tells it */
    readonly changed: boolean;
}

export const NO_MODERATION: ChatModeration = { mutes: new Map(), removed: new Set() };

const MINUTE: number = 60_000;

/**
 * Applies a decision: the latest mute of a participant wins, shorter or longer; an unmute changes something only while
 * its target is muted; a removal ends its mute. A decision on a participant removed means nothing
 * @param time when the sequencer ordered the decision, never before the previous block
 */
export function moderateChat(moderation: ChatModeration, decision: ChatDecision, time: number): ChatModerationResult {
    const { target } = decision;
    if (moderation.removed.has(target)) {
        return { moderation, changed: false };
    }

    const mutes = new Map<string, number>(moderation.mutes);
    switch (decision.action) {
        case ChatModerationAction.MUTE:
            mutes.set(target, decision.minutes === null ? Number.POSITIVE_INFINITY : time + decision.minutes * MINUTE);
            return { moderation: { ...moderation, mutes }, changed: true };
        case ChatModerationAction.UNMUTE:
            mutes.delete(target);
            return { moderation: { ...moderation, mutes }, changed: isMutedAt(moderation, target, time) };
        case ChatModerationAction.REMOVE:
            mutes.delete(target);
            return { moderation: { mutes, removed: new Set<string>(moderation.removed).add(target) }, changed: true };
    }
}

/** Whether the messages of an author ordered at this chain time are hidden: muted then, or removed */
export function isSilenced(moderation: ChatModeration, author: string, time: number): boolean {
    return moderation.removed.has(author) || isMutedAt(moderation, author, time);
}

function isMutedAt(moderation: ChatModeration, author: string, time: number): boolean {
    return (moderation.mutes.get(author) ?? Number.NEGATIVE_INFINITY) > time;
}

/** Who reads a decision: the moderator, its target, or another participant */
enum ChatViewer {
    MODERATOR = 'moderator',
    TARGET = 'target',
    OTHER = 'other',
}

const MUTE_KEYS: Readonly<Record<ChatViewer, string>> = {
    [ChatViewer.MODERATOR]: scopedKey(TranslationScope.CHAT, marker('log.mute.byYou', undefined, 'chat')),
    [ChatViewer.TARGET]: scopedKey(TranslationScope.CHAT, marker('log.mute.you', undefined, 'chat')),
    [ChatViewer.OTHER]: scopedKey(TranslationScope.CHAT, marker('log.mute.other', undefined, 'chat')),
};

const MUTE_TO_END_KEYS: Readonly<Record<ChatViewer, string>> = {
    [ChatViewer.MODERATOR]: scopedKey(TranslationScope.CHAT, marker('log.mute.byYouToEnd', undefined, 'chat')),
    [ChatViewer.TARGET]: scopedKey(TranslationScope.CHAT, marker('log.mute.youToEnd', undefined, 'chat')),
    [ChatViewer.OTHER]: scopedKey(TranslationScope.CHAT, marker('log.mute.otherToEnd', undefined, 'chat')),
};

const UNMUTE_KEYS: Readonly<Record<ChatViewer, string>> = {
    [ChatViewer.MODERATOR]: scopedKey(TranslationScope.CHAT, marker('log.unmute.byYou', undefined, 'chat')),
    [ChatViewer.TARGET]: scopedKey(TranslationScope.CHAT, marker('log.unmute.you', undefined, 'chat')),
    [ChatViewer.OTHER]: scopedKey(TranslationScope.CHAT, marker('log.unmute.other', undefined, 'chat')),
};

// The page of the target gives the room up at once: it reads the text of the others
const REMOVAL_KEYS: Readonly<Record<ChatViewer, string>> = {
    [ChatViewer.MODERATOR]: scopedKey(TranslationScope.CHAT, marker('log.removal.byYou', undefined, 'chat')),
    [ChatViewer.TARGET]: scopedKey(TranslationScope.CHAT, marker('log.removal.other', undefined, 'chat')),
    [ChatViewer.OTHER]: scopedKey(TranslationScope.CHAT, marker('log.removal.other', undefined, 'chat')),
};

/** The notice of a decision in the log, worded for the local player: its moderator, its target, or another participant */
export function decisionText(decision: ChatDecision, moderator: string, localName: string): TranslatableText {
    let viewer: ChatViewer = ChatViewer.OTHER;
    if (moderator === localName) {
        viewer = ChatViewer.MODERATOR;
    } else if (decision.target === localName) {
        viewer = ChatViewer.TARGET;
    }
    const params: Record<string, unknown> = { moderator, name: decision.target };

    switch (decision.action) {
        case ChatModerationAction.MUTE:
            if (decision.minutes === null) {
                return { key: MUTE_TO_END_KEYS[viewer], params };
            }
            return { key: MUTE_KEYS[viewer], params: { ...params, minutes: decision.minutes } };
        case ChatModerationAction.UNMUTE:
            return { key: UNMUTE_KEYS[viewer], params };
        case ChatModerationAction.REMOVE:
            return { key: REMOVAL_KEYS[viewer], params };
    }
}
