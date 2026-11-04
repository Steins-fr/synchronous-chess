import { holdsLink } from '@app/helpers/link.helper';

/** The longest question, in characters: a question answered by yes or no is short */
export const QUESTION_MAX_LENGTH: number = 120;

/**
 * A question of the form the application sends: a text, never blank, without link nor e-mail address, as a message of
 * the chat (one sent around the form is refused alike on every page)
 */
export function isQuestionText(text: unknown): text is string {
    return typeof text === 'string' && text.trim() !== '' && text.length <= QUESTION_MAX_LENGTH && !holdsLink(text);
}
