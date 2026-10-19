import { TranslatableText } from '@app/types/translatable-text.type';

export interface SnackBarDataInterface {
    // Translated in the language shown, followed while the snack bar is open
    content: TranslatableText;
}
