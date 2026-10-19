/** The input of the text field of this label, found as a player finds it: by the text of its label */
export function textFieldInput(root: ParentNode, label: string): HTMLInputElement {
    const field: Element | undefined = [...root.querySelectorAll('app-text-field')]
        .find((candidate: Element) => (candidate.querySelector('mat-label') as Element).textContent.trim() === label);

    if (field === undefined) {
        throw new Error(`No text field labelled '${ label }'`);
    }

    return field.querySelector('input') as HTMLInputElement;
}
