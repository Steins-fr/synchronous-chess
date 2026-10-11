import { Component, input, linkedSignal, output } from '@angular/core';
import { form, schema, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';
import { playerNameRules, roomNameRules, roomPasswordRules } from '../room-form.rules';

/** The room to create, hosted by the player: private with a password */
export interface RoomCreate {
    roomName: string;
    playerName: string;
    /** Only for a private room */
    password?: string;
}

// The model of the form of the dialog
type RoomCreateForm = {
    roomName: string;
    playerName: string;
    /** None when empty: the room is public */
    password: string;
};

const roomCreateSchema = schema<RoomCreateForm>((path) => {
    roomNameRules(path.roomName);
    playerNameRules(path.playerName);
    roomPasswordRules(path.password);
});

/** Asks the name of the room to create, the name of its host, and the password making it private: its result */
@Component({
    selector: 'app-room-create-dialog',
    templateUrl: './room-create.dialog.html',
    imports: [TextFieldComponent, MatButton],
})
export class RoomCreateDialog {
    public readonly result = output<RoomCreate>();

    /** The names given last, if any: to try again once the creation failed */
    public readonly roomName = input<string>('');
    public readonly playerName = input<string>('');

    protected readonly model = linkedSignal<RoomCreateForm>(() => ({ roomName: this.roomName(), playerName: this.playerName(), password: '' }));
    protected readonly createForm = form(this.model, roomCreateSchema, { name: 'room-create' });

    protected create(event: Event): Promise<boolean> {
        // The page does not navigate
        event.preventDefault();

        return submit(this.createForm, {
            action: () => {
                const { roomName, playerName, password } = this.model();
                this.result.emit(password === '' ? { roomName, playerName } : { roomName, playerName, password });
                return Promise.resolve(undefined);
            },
        });
    }
}
