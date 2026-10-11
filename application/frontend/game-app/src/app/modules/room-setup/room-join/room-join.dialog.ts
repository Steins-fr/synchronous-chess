import { Component, input, linkedSignal, output } from '@angular/core';
import { form, maxLength, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { requiredText } from '@app/modules/form/rules/required-text.rule';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';
import { ROOM_PASSWORD_MAX_LENGTH } from '@protocol/room-limits';

/** How the player joins a room of the list: under its name, with the password of a private room */
export interface RoomJoin {
    playerName: string;
    /** Only for a private room */
    password?: string;
}

// The model of the form of the dialog
type RoomJoinForm = {
    playerName: string;
    password: string;
};

/** Asks the name of the player joining a room of the list, and the password of a private one: its result */
@Component({
    selector: 'app-room-join-dialog',
    templateUrl: './room-join.dialog.html',
    imports: [TextFieldComponent, MatButton],
})
export class RoomJoinDialog {
    public readonly result = output<RoomJoin>();

    public readonly roomName = input.required<string>();
    public readonly isPrivate = input.required<boolean>();
    /** The name typed in the setup form, if any */
    public readonly playerName = input<string>('');

    protected readonly model = linkedSignal<RoomJoinForm>(() => ({ playerName: this.playerName(), password: '' }));
    protected readonly joinForm = form(this.model, (path) => {
        requiredText(path.playerName, 'Le nom du joueur est requis');
        // Not a required text: a password may be made of spaces
        required(path.password, { message: 'Le mot de passe est requis', when: () => this.isPrivate() });
        // Never the one of the room: the API refuses a longer one
        maxLength(path.password, ROOM_PASSWORD_MAX_LENGTH, { message: `Le mot de passe fait ${ ROOM_PASSWORD_MAX_LENGTH } caractères au plus` });
    }, { name: 'room-join' });

    protected join(event: Event): Promise<boolean> {
        // The page does not navigate
        event.preventDefault();

        return submit(this.joinForm, {
            action: () => {
                const { playerName, password } = this.model();
                this.result.emit(this.isPrivate() ? { playerName, password } : { playerName });
                return Promise.resolve(undefined);
            },
        });
    }
}
