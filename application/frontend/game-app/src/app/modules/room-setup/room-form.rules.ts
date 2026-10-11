import { maxLength, PathKind, SchemaPath, SchemaPathRules } from '@angular/forms/signals';
import { requiredText } from '@app/modules/form/rules/required-text.rule';
import { PLAYER_NAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH, ROOM_PASSWORD_MAX_LENGTH } from '@protocol/room-limits';

/** The fields of the rooms, checked as the API checks them: the dialogs refuse what the API would */
type TextPath<TPathKind extends PathKind> = SchemaPath<string, SchemaPathRules.Supported, TPathKind>;

/** The name of a room: required, of the length the API accepts */
export function roomNameRules<TPathKind extends PathKind = PathKind.Root>(path: TextPath<TPathKind>): void {
    requiredText(path, 'Le nom de la salle est requis');
    maxLength(path, ROOM_NAME_MAX_LENGTH, { message: `Le nom de la salle fait ${ ROOM_NAME_MAX_LENGTH } caractères au plus` });
}

/** The name of a player: required, of the length the API accepts */
export function playerNameRules<TPathKind extends PathKind = PathKind.Root>(path: TextPath<TPathKind>): void {
    requiredText(path, 'Le nom du joueur est requis');
    maxLength(path, PLAYER_NAME_MAX_LENGTH, { message: `Le nom du joueur fait ${ PLAYER_NAME_MAX_LENGTH } caractères au plus` });
}

/** The password of a room, of the length the API accepts: required only where a rule says so */
export function roomPasswordRules<TPathKind extends PathKind = PathKind.Root>(path: TextPath<TPathKind>): void {
    maxLength(path, ROOM_PASSWORD_MAX_LENGTH, { message: `Le mot de passe fait ${ ROOM_PASSWORD_MAX_LENGTH } caractères au plus` });
}
