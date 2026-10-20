import { Injectable } from '@angular/core';
import { TranslocoMissingHandler, TranslocoMissingHandlerData } from '@jsverse/transloco';

// Throws on a key missing from the translation of the active language, instead of showing the key: fails the spec
@Injectable()
export class ThrowingMissingHandler implements TranslocoMissingHandler {
    public handle(key: string, data: TranslocoMissingHandlerData): never {
        throw new Error(`The key '${ key }' is missing from the translation '${ data.activeLang }'`);
    }
}
