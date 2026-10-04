
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { form, schema, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { requiredText } from '@app/modules/form/rules/required-text.rule';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';
import RoomSetupService, { RoomSetupType } from '@app/services/room-setup/room-setup.service';
import { map } from 'rxjs';

// The model of the form of the setup
type RoomSetup = {
    roomName: string;
    playerName: string;
};

const roomSetupSchema = schema<RoomSetup>((path) => {
    requiredText(path.roomName, 'Le nom de la salle est requis');
    requiredText(path.playerName, 'Le nom du joueur est requis');
});

@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    imports: [TextFieldComponent, MatButtonModule, MatProgressSpinnerModule],
})
export class RoomSetupComponent implements OnInit {
    public readonly maxPlayer = input.required<number>();

    protected readonly setup = signal<RoomSetup>({ roomName: '', playerName: '' });
    protected readonly setupForm = form(this.setup, roomSetupSchema, { name: 'room-setup' });

    private readonly roomSetupService = inject(RoomSetupService);
    private readonly route = inject(ActivatedRoute);
    protected readonly canDisplay = toSignal(this.roomSetupService.roomIsSetup$.pipe(map((roomIsSetup: boolean) => !roomIsSetup)));
    protected readonly loading = toSignal(this.roomSetupService.loading$);

    public ngOnInit(): void {
        const params = this.route.snapshot.queryParamMap;
        if (params.has('auto-create')) {
            this.setup.set({ roomName: this.linkRoom(params), playerName: this.randomPlayerName() });
            void this.hostRoom();
        } else if (params.has('auto-join')) {
            this.setup.set({ roomName: this.linkRoom(params), playerName: this.randomPlayerName() });
            setTimeout(() => this.joinRoom(), 1000);
        }
    }

    protected hostRoom(): Promise<boolean> {
        return this.send('create');
    }

    protected joinRoom(): Promise<boolean> {
        return this.send('join');
    }

    // Sets the room up once both names are typed: submit() touches the fields, showing the error of an empty one
    private send(type: RoomSetupType): Promise<boolean> {
        return submit(this.setupForm, {
            action: () => {
                this.roomSetupService.setup(type, this.setup().roomName, this.setup().playerName);
                return Promise.resolve(undefined);
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
