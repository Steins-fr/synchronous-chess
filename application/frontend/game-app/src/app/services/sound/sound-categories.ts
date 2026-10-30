import { SoundCategory } from './enums/sound-category.enum';
import { SoundEffect } from './enums/sound-effect.enum';

const CHAT_SOUNDS: ReadonlySet<SoundEffect> = new Set<SoundEffect>([SoundEffect.CHAT_MESSAGE, SoundEffect.ROOM_JOIN, SoundEffect.ROOM_LEAVE]);

/** The kind of a sound: the chat and the room, else the game */
export function soundCategory(effect: SoundEffect): SoundCategory {
    return CHAT_SOUNDS.has(effect) ? SoundCategory.CHAT : SoundCategory.GAME;
}
