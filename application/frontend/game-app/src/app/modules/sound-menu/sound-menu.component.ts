import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Component, computed, inject, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { TranslocoDirective } from '@jsverse/transloco';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundCategory } from '@app/services/sound/enums/sound-category.enum';
import { SoundService } from '@app/services/sound/sound.service';

/**
 * Sets the volume of the sound effects, or mutes them, all of them or the ones of the game or of the chat, in a panel opened
 * by its icon button. The icon tells the volume, or that every sound is muted
 */
@Component({
    selector: 'app-sound-menu',
    templateUrl: './sound-menu.component.html',
    imports: [CdkConnectedOverlay, CdkOverlayOrigin, CdkTrapFocus, MatIconButton, MatIcon, MatSlideToggle, MatSlider, MatSliderThumb, TranslocoDirective],
})
export class SoundMenuComponent {
    // The volume set below which the icon shows a low volume
    private static readonly LOW_VOLUME: number = 50;

    protected readonly soundService = inject(SoundService);
    protected readonly category: typeof SoundCategory = SoundCategory;
    protected readonly maxVolume: number = SoundService.MAX_VOLUME;
    protected readonly open = signal<boolean>(false);
    protected readonly icon = computed<string>(() => {
        const volume: number = this.soundService.volume();
        const categoriesMuted: boolean = Object.values(SoundCategory).every((category: SoundCategory) => this.soundService.categoryMuted(category));
        if (this.soundService.muted() || volume === 0 || categoriesMuted) {
            return 'volume_off';
        }
        return volume < SoundMenuComponent.LOW_VOLUME ? 'volume_down' : 'volume_up';
    });

    // The volume set: a sound lets the user hear it, of the chat when the game is muted
    protected preview(): void {
        this.soundService.play(this.soundService.categoryMuted(SoundCategory.GAME) ? SoundEffect.CHAT_MESSAGE : SoundEffect.CHESS_MOVE);
    }

    protected closeOnEscape(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.open.set(false);
        }
    }
}
