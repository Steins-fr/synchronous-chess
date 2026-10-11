import { Component, input, output, signal } from '@angular/core';
import { form, required, schema, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';

// The model of the form of the dialog
type RoomPassword = {
    password: string;
};

// Not a required text: a password may be made of spaces
const roomPasswordSchema = schema<RoomPassword>((path) => {
    required(path.password, { message: 'Le mot de passe est requis' });
});

/** Asks the password of a private room, its result */
@Component({
    selector: 'app-room-password-dialog',
    templateUrl: './room-password.dialog.html',
    imports: [TextFieldComponent, MatButton],
})
export class RoomPasswordDialog {
    public readonly result = output<string>();

    public readonly roomName = input.required<string>();

    protected readonly model = signal<RoomPassword>({ password: '' });
    protected readonly passwordForm = form(this.model, roomPasswordSchema, { name: 'room-password' });

    protected join(event: Event): Promise<boolean> {
        // The page does not navigate
        event.preventDefault();

        return submit(this.passwordForm, {
            action: () => {
                this.result.emit(this.model().password);
                return Promise.resolve(undefined);
            },
        });
    }
}
