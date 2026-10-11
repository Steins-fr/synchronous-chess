
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { form, schema, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { requiredText } from '@app/modules/form/rules/required-text.rule';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';
import { DialogService } from '@app/services/dialog/dialog.service';
import RoomSetupService, { RoomSetupType } from '@app/services/room-setup/room-setup.service';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { map } from 'rxjs';
import { OpenRoomsComponent } from './open-rooms/open-rooms.component';
import { RoomPasswordDialog } from './room-password/room-password.dialog';

// The model of the form of the setup
type RoomSetup = {
    roomName: string;
    playerName: string;
    /** Makes the created room private, or joins a private room: none when empty */
    password: string;
};

const roomSetupSchema = schema<RoomSetup>((path) => {
    requiredText(path.roomName, 'Le nom de la salle est requis');
    requiredText(path.playerName, 'Le nom du joueur est requis');
});

@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    imports: [TextFieldComponent, OpenRoomsComponent, MatButtonModule, MatProgressSpinnerModule],
})
export class RoomSetupComponent implements OnInit {
    public readonly game = input.required<RoomGame>();
    public readonly maxPlayer = input.required<number>();

    protected readonly setup = signal<RoomSetup>({ roomName: '', playerName: '', password: '' });
    protected readonly setupForm = form(this.setup, roomSetupSchema, { name: 'room-setup' });

    private readonly roomSetupService = inject(RoomSetupService);
    private readonly route = inject(ActivatedRoute);
    private readonly dialogService = inject(DialogService);
    protected readonly canDisplay = toSignal(this.roomSetupService.roomIsSetup$.pipe(map((roomIsSetup: boolean) => !roomIsSetup)));
    protected readonly loading = toSignal(this.roomSetupService.loading$);

    public ngOnInit(): void {
        const params = this.route.snapshot.queryParamMap;
        if (params.has('auto-create')) {
            this.setup.set({ roomName: this.linkRoom(params), playerName: this.randomPlayerName(), password: '' });
            void this.hostRoom();
        } else if (params.has('auto-join')) {
            this.setup.set({ roomName: this.linkRoom(params), playerName: this.randomPlayerName(), password: '' });
            setTimeout(() => this.joinRoom(), 1000);
        }
    }

    protected hostRoom(): Promise<boolean> {
        return this.send('create');
    }

    protected joinRoom(): Promise<boolean> {
        return this.send('join');
    }

    /** Joins a room of the list, asking first the password of a private one */
    protected joinOpenRoom(room: Readonly<OpenRoom>): Promise<boolean> {
        this.setup.update((setup: RoomSetup) => ({ ...setup, roomName: room.roomName }));

        if (!room.isPrivate) {
            return this.joinRoom();
        }

        return this.whenNamed(async () => {
            const password: string | void = await this.dialogService.open(RoomPasswordDialog, {
                title: 'Salle privée',
                inputs: { roomName: room.roomName },
            });

            // Not once the dialog is closed
            if (typeof password === 'string') {
                this.roomSetupService.setup('join', room.roomName, this.setup().playerName, password);
            }
        });
    }

    private send(type: RoomSetupType): Promise<boolean> {
        return this.whenNamed(() => {
            const { roomName, playerName, password } = this.setup();
            this.roomSetupService.setup(type, roomName, playerName, password === '' ? undefined : password);
        });
    }

    // Runs once both names are typed: submit() touches the fields, showing the error of an empty one
    private whenNamed(action: () => Promise<void> | void): Promise<boolean> {
        return submit(this.setupForm, {
            action: async () => {
                await action();
                return undefined;
            },
        });
    }

    // The room of an auto link: the default one when the link gives none, or an empty one
    private linkRoom(params: ParamMap): string {
        const room: string = params.get('room') ?? '';
        return room === '' ? 'test' : room;
    }

    private randomPlayerName(): string {
        return `${ CryptoHelper.randomNumber(100_000, 999_999) }`;
    }
}
