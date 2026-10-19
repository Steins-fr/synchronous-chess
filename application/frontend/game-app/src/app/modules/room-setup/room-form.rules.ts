import { maxLength, minLength, PathKind, SchemaPath, SchemaPathRules } from '@angular/forms/signals';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { requiredText } from '@app/modules/form/rules/required-text.rule';
import { PLAYER_NAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH, ROOM_PASSWORD_MAX_LENGTH, ROOM_PASSWORD_MIN_LENGTH } from '@protocol/room-limits';

/** The fields of the rooms, checked as the API checks them: the dialogs refuse what the API would */
type TextPath<TPathKind extends PathKind> = SchemaPath<string, SchemaPathRules.Supported, TPathKind>;

/** The name of a room: required, of the length the API accepts */
export function roomNameRules<TPathKind extends PathKind = PathKind.Root>(path: TextPath<TPathKind>): void {
    requiredText(path, marker('rooms.form.roomName.required'));
    maxLength(path, ROOM_NAME_MAX_LENGTH, { message: marker('rooms.form.roomName.maxLength') });
}

/** The name of a player: required, of the length the API accepts */
export function playerNameRules<TPathKind extends PathKind = PathKind.Root>(path: TextPath<TPathKind>): void {
    requiredText(path, marker('rooms.form.playerName.required'));
    maxLength(path, PLAYER_NAME_MAX_LENGTH, { message: marker('rooms.form.playerName.maxLength') });
}

/** The password of a room, of the length the API accepts: required only where a rule says so, empty when not */
export function roomPasswordRules<TPathKind extends PathKind = PathKind.Root>(path: TextPath<TPathKind>): void {
    minLength(path, ROOM_PASSWORD_MIN_LENGTH, { message: marker('rooms.form.password.minLength') });
    maxLength(path, ROOM_PASSWORD_MAX_LENGTH, { message: marker('rooms.form.password.maxLength') });
}
